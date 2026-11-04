import type {
  ExpenseRecord,
  ExpenseUse,
  MerchantRule,
  Profile,
  Suggestion,
  WriteOffStatus,
} from './types';
import { categoryFor, normalize } from './core';
import { RULE_PACK } from './rules/us-common-2026';

export { RULE_PACK };

function base(partial: Omit<Suggestion, 'ruleId' | 'ruleVersion' | 'sourceCitation'>): Suggestion {
  return {
    ...partial,
    ruleId: RULE_PACK.id,
    ruleVersion: RULE_PACK.version,
    sourceCitation: RULE_PACK.citation,
  };
}

/**
 * Profile-aware write-off suggestion engine.
 * Returns structured customer-facing states; never equates business use with tax savings.
 */
export function suggestWriteOff(
  r: Pick<ExpenseRecord, 'merchant' | 'category' | 'type' | 'notes' | 'reviewed' | 'treatmentSource' | 'percent' | 'eligibilityChecked'>,
  profile: Partial<Profile> = {},
  rules: MerchantRule[] = [],
): Suggestion {
  const rule = rules.find((x) => x.merchant === normalize(r.merchant));
  const category = rule?.category || r.category || categoryFor(r.merchant);
  const context =
    profile.industry === 'creative'
      ? 'creative work'
      : profile.industry === 'retail'
        ? 'your selling business'
        : profile.industry === 'trades'
          ? 'your field work'
          : profile.industry === 'consulting'
            ? 'your professional services'
            : 'your business';

  // User already recorded an explicit treatment
  if (r.treatmentSource === 'user' && r.reviewed) {
    return base({
      category,
      use: r.type,
      label: 'User-entered treatment',
      reason:
        'You set how this expense should be treated. Future scans will not overwrite your choice.',
      question: '',
      share: r.type === 'Split' ? 50 : r.type === 'Business' ? 100 : 0,
      remembered: false,
      status: 'user_entered',
      suggestedEligiblePercent: r.eligibilityChecked ? r.percent : null,
      missing: null,
    });
  }

  if (r.treatmentSource === 'tax_pro' && r.reviewed) {
    return base({
      category,
      use: r.type,
      label: 'Reviewed with a tax professional',
      reason:
        'You marked this treatment as checked with a tax professional. It stays until you change it.',
      question: '',
      share: r.type === 'Business' ? 100 : r.type === 'Split' ? 50 : 0,
      remembered: false,
      status: 'user_entered',
      suggestedEligiblePercent: r.eligibilityChecked ? r.percent : null,
      missing: null,
    });
  }

  let use: ExpenseUse = rule?.type || (profile.mode === 'Personal' ? 'Personal' : 'Unsorted');
  let label = 'Needs a little context';
  let reason =
    'A merchant name alone cannot tell us whether this expense was personal or for work.';
  let question = 'Was this purchase for your business, personal use, or both?';
  let status: WriteOffStatus = 'needs_detail';
  let suggestedEligiblePercent: number | null = null;
  let missing: string | null = 'business_or_personal_use';
  let share = rule?.share || 50;

  if (category === 'Transfers & payments') {
    return base({
      category,
      use: 'Unsorted',
      label: 'Check for a transfer',
      reason:
        'This may be a transfer or card payment. Counting it alongside the original purchases could double-count spending.',
      question: 'Is this a payment or transfer rather than a purchase?',
      share: 0,
      remembered: !!rule,
      status: 'transfer_check',
      suggestedEligiblePercent: null,
      missing: 'transfer_or_purchase',
    });
  }

  if (profile.country && profile.country !== 'US') {
    return base({
      category,
      use: 'Unsorted',
      label: 'Keep for local tax review',
      reason:
        'Tax suggestions currently cover U.S. record organization only. Keep the receipt for review under your local rules.',
      question: 'Which local rules apply to this purchase?',
      share: 0,
      remembered: false,
      status: 'needs_detail',
      suggestedEligiblePercent: null,
      missing: 'unsupported_jurisdiction',
    });
  }

  if (category === 'Medical' || category === 'Charitable giving') {
    use = 'Personal';
    label = 'Possible personal tax record';
    status = 'possible_writeoff';
    missing = category === 'Medical' ? 'medical_reimbursement' : 'donation_benefit';
    suggestedEligiblePercent = null; // never auto-fill eligible % for these
    reason =
      category === 'Medical'
        ? 'This may be a medical purchase. Verify the items, reimbursements and applicable tax-year rules; ordinary retail may not qualify.'
        : 'This may be a donation. Verify the recipient, any benefit received and the applicable tax-year rules.';
    question =
      category === 'Medical'
        ? 'What was paid, and was any part reimbursed?'
        : 'What was donated, and did you receive anything in return?';
  } else if (profile.mode === 'Personal' || profile.worktype === 'personal') {
    use = 'Personal';
    label = 'No write-off identified';
    status = 'no_writeoff_identified';
    missing = null;
    reason =
      'Routine personal spending is generally not a business write-off. Keep it organized; change the treatment if this one needs tax review.';
    question = '';
    suggestedEligiblePercent = 0;
  } else if (profile.worktype === 'employee') {
    label = 'Needs one detail';
    status = 'needs_detail';
    missing = 'employee_reimbursement';
    reason =
      'Employee expenses have different federal and state rules. Business use alone does not make this deductible.';
    question = 'Was this reimbursed by an employer, or is it unreimbursed?';
    suggestedEligiblePercent = null;
  } else if (
    ['Software & subscriptions', 'Office & supplies', 'Marketing', 'Professional services'].includes(
      category,
    )
  ) {
    use = 'Business';
    share = 100;
    label = 'Possible write-off';
    status = 'possible_writeoff';
    missing = r.notes?.trim() ? null : 'purpose_note';
    reason = `This category may support ${context}. Confirm it was for work and record any personal portion. Business use is not the same as an eligible deduction.`;
    question = `How did this support ${context}?`;
    // Eligible % only suggested when purpose is present and self-employed context is clear
    suggestedEligiblePercent =
      profile.worktype === 'self' && r.notes?.trim() ? null : null; // still require explicit user check
  } else if (category === 'Travel & transport') {
    label = 'Needs one detail';
    status = 'needs_detail';
    missing = 'trip_purpose';
    reason =
      'Business travel may need supporting records. Ordinary commuting and personal travel should not be counted as business use.';
    question = 'Where were you going, and what was the work purpose?';
  } else if (category === 'Meals') {
    label = 'Needs one detail';
    status = 'needs_detail';
    missing = 'meal_purpose';
    reason =
      'An everyday personal meal is not a business expense. A work-related meal needs context and may have additional limits — we never auto-apply a meal percentage.';
    question = 'Who attended, and what was the business purpose?';
    suggestedEligiblePercent = null;
  } else if (category === 'Equipment') {
    use = 'Business';
    share = 100;
    label = 'Possible write-off';
    status = 'possible_writeoff';
    missing = 'equipment_use';
    reason =
      'Equipment may support your work, but business use, personal use and how the cost is treated need review.';
    question = 'What did you buy, and how will you use it for work?';
  } else if (category === 'Education & training') {
    label = 'Needs one detail';
    status = 'needs_detail';
    missing = 'training_connection';
    reason =
      'Whether training relates to your existing work, a new career or personal interests matters.';
    question = 'How does this relate to your existing work?';
  } else if (category === 'Home office') {
    label = 'Needs one detail';
    status = 'needs_detail';
    missing = 'home_office_allocation';
    reason =
      'A home purchase is not automatically a business expense. Workspace-use requirements and allocation need separate review.';
    question = 'What portion of this relates to a dedicated workspace?';
  } else {
    label = 'Needs a little context';
    status = 'needs_detail';
    missing = 'business_or_personal_use';
    reason =
      'We could not match a specific rule. Keep the receipt and choose how this was used.';
    question = 'Was this purchase for your business, personal use, or both?';
  }

  if (rule && category !== 'Transfers & payments') {
    use = rule.type;
    share = rule.share || (rule.type === 'Business' ? 100 : rule.type === 'Split' ? 50 : 0);
    label = 'From your saved preference';
    status = rule.type === 'Personal' ? 'no_writeoff_identified' : 'possible_writeoff';
    reason = `You previously chose ${rule.type.toLowerCase()} for this merchant. ${
      rule.type === 'Split' ? `Suggested business share: ${rule.share}%. ` : ''
    }Check this purchase too; use can change.`;
    missing = null;
    question = '';
  }

  return base({
    category,
    use,
    label,
    reason,
    question,
    share,
    remembered: !!rule,
    status,
    suggestedEligiblePercent,
    missing,
  });
}

/** Thin alias for call sites — fills missing fields for suggestion. */
export function suggest(
  r: Partial<ExpenseRecord> & Pick<ExpenseRecord, 'merchant'>,
  profile: Partial<Profile> = {},
  rules: MerchantRule[] = [],
): Suggestion {
  return suggestWriteOff(
    {
      merchant: r.merchant,
      category: r.category || '',
      type: r.type || 'Unsorted',
      notes: r.notes || '',
      reviewed: !!r.reviewed,
      treatmentSource: r.treatmentSource || 'suggestion',
      percent: r.percent || 0,
      eligibilityChecked: !!r.eligibilityChecked,
    },
    profile,
    rules,
  );
}

export function statusLabel(status: WriteOffStatus): string {
  switch (status) {
    case 'possible_writeoff':
      return 'Possible write-off';
    case 'needs_detail':
      return 'Needs one detail';
    case 'no_writeoff_identified':
      return 'No write-off identified';
    case 'user_entered':
      return 'User-entered treatment';
    case 'transfer_check':
      return 'Check for a transfer';
  }
}

/** Decimal-safe cents helpers */
export const toCents = (amount: number) => Math.round(amount * 100);
export const fromCents = (cents: number) => cents / 100;

export function businessUseAmount(r: ExpenseRecord): number {
  const share =
    r.type === 'Business' ? 100 : r.type === 'Split' ? r.share : r.type === 'Personal' ? 0 : 0;
  return fromCents(Math.round((toCents(r.amount) * share) / 100));
}

export function eligibleAmount(r: ExpenseRecord): number {
  if (!r.eligibilityChecked) return 0;
  return fromCents(Math.round((toCents(r.amount) * r.percent) / 100));
}

export function summarizeExpenses(
  records: ExpenseRecord[],
  profile: Partial<Profile>,
  rules: MerchantRule[],
) {
  const totalCents = records.reduce((s, r) => s + toCents(r.amount), 0);
  const personalCents = records
    .filter((r) => r.type === 'Personal')
    .reduce((s, r) => s + toCents(r.amount), 0);
  const businessCents = records.reduce((s, r) => s + toCents(businessUseAmount(r)), 0);
  const eligibleCents = records.reduce((s, r) => s + toCents(eligibleAmount(r)), 0);

  // Possible write-offs: unreviewed expenses the engine flags as possible_writeoff (full amount),
  // plus reviewed business/split amounts not yet given an explicit eligible %.
  let possibleWriteOffCents = 0;
  for (const r of records) {
    const sug = suggestWriteOff(r, profile, rules);
    if (!r.reviewed && sug.status === 'possible_writeoff') {
      possibleWriteOffCents += toCents(r.amount);
    } else if (
      r.reviewed &&
      (r.type === 'Business' || r.type === 'Split') &&
      !r.eligibilityChecked
    ) {
      possibleWriteOffCents += toCents(businessUseAmount(r));
    }
  }

  return {
    total: fromCents(totalCents),
    personal: fromCents(personalCents),
    businessUse: fromCents(businessCents),
    possibleWriteOffs: fromCents(possibleWriteOffCents),
    eligibleSelected: fromCents(eligibleCents),
    count: records.length,
    pending: records.filter((r) => !r.reviewed).length,
  };
}
