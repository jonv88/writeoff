/**
 * Unsaved receipt review.
 * Text stays in this browser’s local storage. The photo stays in origin-private IndexedDB,
 * not in a public URL and not in local storage. Nothing is an expense until Save.
 */

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

const PHOTO_DB = 'writeoff-private-draft';
const PHOTO_STORE = 'receipt';

function openPhotoDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PHOTO_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PHOTO_STORE)) db.createObjectStore(PHOTO_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Keep the accepted photo on this device so closing the review does not require another read. */
export async function saveReceiptPhoto(file: Blob, meta: { name: string; type: string }): Promise<void> {
  if (typeof indexedDB === 'undefined' || !file) return;
  const db = await openPhotoDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, 'readwrite');
    tx.objectStore(PHOTO_STORE).put(
      { blob: file, name: meta.name, type: meta.type || file.type, savedAt: new Date().toISOString() },
      'current',
    );
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadReceiptPhoto(): Promise<File | null> {
  if (typeof indexedDB === 'undefined') return null;
  const db = await openPhotoDb();
  const record = await new Promise<{ blob?: Blob; name?: string; type?: string } | undefined>((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, 'readonly');
    const request = tx.objectStore(PHOTO_STORE).get('current');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  if (!record?.blob) return null;
  return new File([record.blob], record.name || 'receipt', { type: record.type || record.blob.type || 'image/jpeg' });
}

export async function clearReceiptPhoto(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openPhotoDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, 'readwrite');
    tx.objectStore(PHOTO_STORE).delete('current');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
