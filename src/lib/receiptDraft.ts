/** Text-only unsaved receipt review. The photo is not stored here and nothing is claimed as saved. */

export const RECEIPT_DRAFT_KEY = 'writeoff.receipt.draft.v1';

export type ReceiptDraft = {
  merchant: string;
  amount: string;
  date: string;
  currency: string;
  notes: string;
  updatedAt: string;
};

export function loadReceiptDraft(): ReceiptDraft | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(RECEIPT_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ReceiptDraft>;
    if (!parsed.merchant && !parsed.amount && !parsed.date) return null;
    return {
      merchant: String(parsed.merchant || ''),
      amount: String(parsed.amount || ''),
      date: String(parsed.date || ''),
      currency: String(parsed.currency || 'USD'),
      notes: String(parsed.notes || ''),
      updatedAt: String(parsed.updatedAt || ''),
    };
  } catch {
    return null;
  }
}

export function saveReceiptDraft(draft: ReceiptDraft): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(RECEIPT_DRAFT_KEY, JSON.stringify(draft));
}

export function clearReceiptDraft(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(RECEIPT_DRAFT_KEY);
}
