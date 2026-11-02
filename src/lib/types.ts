export type ExpenseUse = 'Business' | 'Personal' | 'Split' | 'Unsorted';

export type ProfileMode = 'Both' | 'Business' | 'Personal';

export type WorkType = 'self' | 'employee' | 'mixed' | 'personal';

export type Industry =
  | 'general'
  | 'creative'
  | 'consulting'
  | 'retail'
  | 'trades';

export type ViewName = 'Review' | 'Expenses' | 'Receipts' | 'Accounts' | 'Settings';

export interface ReceiptMeta {
  name: string;
  /** Storage object path within the private receipts bucket (server-side). */
  storagePath: string;
  /** Optional signed URL for display; never persisted as the source of truth. */
  signedUrl?: string;
  mimeType?: string;
  sizeBytes?: number;
}

export interface ExpenseRecord {
  id: string;
  merchant: string;
  amount: number;
  date: string;
  category: string;
  type: ExpenseUse;
  share: number;
  entity: string;
  notes: string;
  percent: number;
  eligibilityChecked: boolean;
  reviewed: boolean;
  source: string;
  account: string;
  receipt: ReceiptMeta | null;
  fingerprint?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Profile {
  mode: ProfileMode;
  worktype: WorkType;
  industry: Industry;
  country: string;
  name: string;
  complete: boolean;
}

export interface MerchantRule {
  id?: string;
  merchant: string;
  type: ExpenseUse;
  share: number;
  category: string;
}

export interface Suggestion {
  category: string;
  use: ExpenseUse;
  label: string;
  reason: string;
  question: string;
  share: number;
  remembered: boolean;
}

export interface WorkspaceState {
  records: ExpenseRecord[];
  profile: Profile;
  rules: MerchantRule[];
}

export const defaultProfile = (): Profile => ({
  mode: 'Both',
  worktype: 'self',
  industry: 'general',
  country: 'US',
  name: '',
  complete: false,
});
