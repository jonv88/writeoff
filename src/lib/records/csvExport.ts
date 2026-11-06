import type { ExpenseRecord } from '../types';
import { businessUseAmount, eligibleAmount } from '../writeoffEngine';

const COLUMNS = [
  'Merchant',
  'Date',
  'Currency',
  'Amount',
  'Category',
  'Use',
  'Business use amount',
  'Eligible amount checked',
  'Eligibility checked',
  'Notes',
  'Source',
  'Account',
] as const;

/** Spreadsheet-safe cell. A leading formula character is quoted as text. */
export function csvCell(value: unknown): string {
  const text = String(value ?? '');
  const safe = /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function expensesToCsv(records: ExpenseRecord[]): string {
  const rows = [
    [...COLUMNS],
    ...records.map((record) => [
      record.merchant,
      record.date,
      record.currency || 'USD',
      record.amount.toFixed(2),
      record.category,
      record.type,
      businessUseAmount(record).toFixed(2),
      record.eligibilityChecked ? eligibleAmount(record).toFixed(2) : '',
      record.eligibilityChecked ? 'yes' : 'no',
      record.notes,
      record.source,
      record.account,
    ]),
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
}
