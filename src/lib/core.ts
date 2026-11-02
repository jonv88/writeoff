import type { ExpenseRecord, ExpenseUse, Profile, Suggestion, MerchantRule } from './types';

/** Conservative U.S. record-organizing rules; never tax-eligibility determinations. */
export const categories = [
  'Software & subscriptions',
  'Office & supplies',
  'Travel & transport',
  'Meals',
  'Marketing',
  'Professional services',
  'Education & training',
  'Equipment',
  'Home office',
  'Medical',
  'Charitable giving',
  'Transfers & payments',
  'Other',
] as const;

export const normalize = (s: unknown) =>
  String(s || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');

export function categoryFor(merchant: string): string {
  const m = normalize(merchant);
  const rules: [RegExp, string][] = [
    [/payment|transfer|autopay|credit card pmt/, 'Transfers & payments'],
    [/adobe|figma|canva|dropbox|zoom|microsoft|github|notion|software/, 'Software & subscriptions'],
    [/staples|office depot|office supplies/, 'Office & supplies'],
    [/uber|lyft|airlines|jetblue|delta air|united air|parking|toll|amtrak|hotel|marriott/, 'Travel & transport'],
    [/restaurant|cafe|coffee|starbucks|chipotle|chick.fil/, 'Meals'],
    [/google ads|meta ads|facebook ads|advertising/, 'Marketing'],
    [/accountant|bookkeep|legal fee/, 'Professional services'],
    [/workshop|course|tuition|training/, 'Education & training'],
    [/camera|b&h|adorama|equipment/, 'Equipment'],
    [/pharmacy|cvs|walgreens|medical|dental|hospital/, 'Medical'],
    [/donation|charity|red cross/, 'Charitable giving'],
  ];
  for (const [rx, cat] of rules) {
    if (rx.test(m)) return cat;
  }
  return 'Other';
}

export function suggest(
  r: Pick<ExpenseRecord, 'merchant' | 'category'>,
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
          : 'your business';

  let use: ExpenseUse = rule?.type || (profile.mode === 'Personal' ? 'Personal' : 'Unsorted');
  let label = 'Needs a little context';
  let reason =
    'A merchant name alone cannot tell us whether this expense was personal or for work.';
  let question = 'What was this purchase used for?';

  if (category === 'Transfers & payments') {
    label = 'Check for a transfer';
    reason =
      'This may be a transfer or card payment. Counting it alongside the original purchases could double-count spending.';
    question = 'Is this a payment or transfer rather than a purchase?';
    use = 'Unsorted';
  } else if (profile.country && profile.country !== 'US') {
    label = 'Keep for local tax review';
    reason =
      'Tax suggestions currently cover U.S. record organization only. Keep the receipt for review under your local rules.';
  } else if (category === 'Medical' || category === 'Charitable giving') {
    label = 'Possible personal tax record';
    use = 'Personal';
    reason =
      category === 'Medical'
        ? 'This may be a medical purchase. Verify the actual items, reimbursements and applicable tax-year rules; general retail purchases may not qualify.'
        : 'This may be a donation. Verify the recipient, any benefit received and the applicable tax-year rules.';
    question = 'What was paid, and was any part reimbursed or received in return?';
  } else if (profile.mode === 'Personal') {
    label = 'Personal spending';
    reason =
      'Routine personal spending is generally not deductible. Keep it organized; flag an item separately if it needs tax review.';
    use = 'Personal';
  } else if (profile.worktype === 'employee') {
    label = 'Employee expense — needs review';
    reason =
      'Employee expenses have different federal and state rules. Business use does not by itself make this deductible.';
  } else if (
    ['Software & subscriptions', 'Office & supplies', 'Marketing', 'Professional services'].includes(
      category,
    )
  ) {
    label = 'Possible business expense';
    reason = `This category may support ${context}. Confirm that it was for work and record any personal portion.`;
    use = 'Business';
    question = `How did this support ${context}?`;
  } else if (category === 'Travel & transport') {
    label = 'Work trip or personal travel?';
    reason =
      'Business travel may need supporting records. Ordinary commuting and personal travel should not be counted as business use.';
    question = 'Where were you going, and what was the work purpose?';
  } else if (category === 'Meals') {
    label = 'Meal — purpose matters';
    reason =
      'An everyday personal meal is not a business expense. A work-related meal needs context and may have additional limits.';
    question = 'Who attended, and what was the business purpose?';
  } else if (category === 'Equipment') {
    label = 'Possible work equipment';
    reason =
      'Equipment may support your work, but business use, personal use and how the cost is treated need review.';
    question = 'What did you buy, and how will you use it for work?';
  } else if (category === 'Education & training') {
    label = 'Training — check the connection';
    reason =
      'Whether training relates to your existing work, a new career or personal interests matters.';
    question = 'How does this relate to your existing work?';
  } else if (category === 'Home office') {
    label = 'Home office — needs review';
    reason =
      'A home purchase is not automatically a business expense. Workspace-use requirements and allocation need separate review.';
  }

  if (rule && category !== 'Transfers & payments') {
    label = 'From your saved preference';
    reason = `You previously chose ${rule.type.toLowerCase()} for this merchant. ${
      rule.type === 'Split' ? `Suggested business share: ${rule.share}%. ` : ''
    }Check this purchase too; use can change.`;
    use = rule.type;
  }

  return {
    category,
    use,
    label,
    reason,
    question,
    share: rule?.share || 50,
    remembered: !!rule,
  };
}

export function parseCSV(text: string): string[][] {
  text = text.replace(/^\uFEFF/, '');
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (!quoted && cell.length) {
        throw Error('Unexpected quote in CSV.');
      } else {
        quoted = !quoted;
      }
    } else if (c === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((x) => x.trim())) out.push(row);
      row = [];
      cell = '';
    } else {
      cell += c;
    }
  }
  if (quoted) throw Error('An opening quote is not closed.');
  row.push(cell);
  if (row.some((x) => x.trim())) out.push(row);
  if (out.length > 2001) throw Error('Please import at most 2,000 transactions at a time.');
  return out;
}

export function parseDate(value: unknown): string | null {
  const s = String(value || '').trim();
  let y: string, m: string, d: string;
  let match: RegExpMatchArray | null;
  if ((match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) {
    [, y, m, d] = match;
  } else if ((match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) {
    [, m, d, y] = match;
  } else {
    return null;
  }
  const date = new Date(Date.UTC(+y, +m - 1, +d));
  return date.getUTCFullYear() === +y &&
    date.getUTCMonth() === +m - 1 &&
    date.getUTCDate() === +d
    ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    : null;
}

export function parseAmount(v: unknown): number {
  let s = String(v ?? '').trim();
  if (!s) return NaN;
  const paren = /^\(.*\)$/.test(s);
  s = s.replace(/[,$()\s]/g, '');
  if (!/^[+-]?\d+(\.\d{1,2})?$/.test(s)) return NaN;
  return Number(s) * (paren ? -1 : 1);
}

export function fingerprint(r: {
  date: string;
  merchant: string;
  amount: number;
  account?: string;
}): string {
  return [r.date, normalize(r.merchant), Number(r.amount).toFixed(2), normalize(r.account)].join(
    '|',
  );
}

export const money = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

export const esc = (s: unknown) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);

export function recordDate(r: { date: string }) {
  return new Date(r.date + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
