/**
 * Maintained U.S. record-organizing rules for tax year 2026.
 * These organize possible records — they are not eligibility determinations or tax advice.
 * Sources consulted for framing: IRS Pub 334, 463, 529, 535, 946 (guidance checked 2026-11-02).
 */
export const RULE_PACK = {
  id: 'us-common',
  version: '2026.11.02',
  jurisdiction: 'US',
  taxYear: 2026,
  citation:
    'U.S. IRS Pubs 334/463/529/535/946 framing · Writeoff rule pack 2026.11.02 · not a determination of deductibility',
} as const;

export type RuleCategory =
  | 'Software & subscriptions'
  | 'Office & supplies'
  | 'Travel & transport'
  | 'Meals'
  | 'Marketing'
  | 'Professional services'
  | 'Education & training'
  | 'Equipment'
  | 'Home office'
  | 'Medical'
  | 'Charitable giving'
  | 'Transfers & payments'
  | 'Other';
