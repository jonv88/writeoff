/** Conservative U.S. record-organizing helpers; tax suggestions live in writeoffEngine. */

export { suggest, suggestWriteOff, statusLabel, summarizeExpenses } from './writeoffEngine';
export type { Suggestion } from './types';

/** Category list for forms and filters. */
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
    [/donation|charity|red cross/, 'Charitable giving'],
  ];
  for (const [rx, cat] of rules) {
    if (rx.test(m)) return cat;
  }
  return 'Other';
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
