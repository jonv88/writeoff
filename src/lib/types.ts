export type ExpenseUse = 'Business' | 'Personal' | 'Split' | 'Unsorted';

export type ProfileMode = 'Both' | 'Business' | 'Personal';

export type WorkType = 'self' | 'employee' | 'mixed' | 'personal';

export type Industry =
  | 'general'
  | 'creative'
  | 'consulting'
  | 'retail'
  | 'trades';

export type EntityType = 'sole_prop' | 'llc' | 'corp' | 'partnership' | 'employee' | 'personal' | 'unspecified';

export type ViewName = 'Review' | 'Expenses' | 'Receipts' | 'Accounts' | 'Settings';

/** Customer-facing write-off review states (not legal rulings). */
export type WriteOffStatus =
  | 'possible_writeoff'
  | 'needs_detail'
  | 'no_writeoff_identified'
  | 'user_entered'
  | 'transfer_check';

export type TreatmentSource = 'suggestion' | 'user' | 'tax_pro';

export interface ReceiptMeta {
  name: string;
  /** Storage object path within the private receipts bucket (server-side). */
  storagePath: string;
  /** Optional signed URL for display; never persisted as the source of truth. */
  signedUrl?: string;
  /** Local object URL / data URL for preview drafts before cloud confirm. */
  localPreviewUrl?: string;
  mimeType?: string;
  sizeBytes?: number;
  extractionStatus?: 'none' | 'uploading' | 'reading' | 'ready' | 'needs_details' | 'failed';
  extractionConfidence?: number;
  extractionVersion?: string;
}

export interface ExpenseRecord {
  id: string;
  merchant: string;
  amount: number;
  /** ISO currency; Phase A/B UI assumes USD unless set. */
  currency: string;
  date: string;
  category: string;
  type: ExpenseUse;
  /** Business-use percentage (0–100). Distinct from eligible write-off %. */
  share: number;
  entity: string;
  notes: string;
  /** User-selected eligible write-off percentage of the full expense. */
  percent: number;
  eligibilityChecked: boolean;
  reviewed: boolean;
  source: string;
  account: string;
  receipt: ReceiptMeta | null;
  fingerprint?: string;
  /** Last engine suggestion snapshot (informational; not overwritten by user treatment). */
  suggestedStatus?: WriteOffStatus;
  suggestedEligiblePercent?: number | null;
  suggestedCategory?: string;
  suggestedUse?: ExpenseUse;
  suggestionRuleId?: string;
  suggestionRuleVersion?: string;
  suggestionReason?: string;
  /** Who last set the saved treatment fields. */
  treatmentSource?: TreatmentSource;
  createdAt?: string;
  updatedAt?: string;
}

export interface Profile {
  mode: ProfileMode;
  worktype: WorkType;
  industry: Industry;
  country: string;
  /** US state / jurisdiction code when country is US (e.g. CA). Empty = not specified. */
  jurisdiction: string;
  taxYear: number;
  entityType: EntityType;
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
  /** Structured write-off status for UI. */
  status: WriteOffStatus;
  /** Suggested eligible % only when sufficiently supported; else null. */
  suggestedEligiblePercent: number | null;
  missing: string | null;
  ruleId: string;
  ruleVersion: string;
  sourceCitation: string;
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
  jurisdiction: '',
  taxYear: new Date().getFullYear(),
  entityType: 'unspecified',
  name: '',
  complete: false,
});

export function emptyExpense(partial: Partial<ExpenseRecord> & Pick<ExpenseRecord, 'id' | 'merchant' | 'amount' | 'date'>): ExpenseRecord {
  return {
    currency: 'USD',
    category: 'Other',
    type: 'Unsorted',
    share: 0,
    entity: '',
    notes: '',
    percent: 0,
    eligibilityChecked: false,
    reviewed: false,
    source: 'Manual expense',
    account: '',
    receipt: null,
    treatmentSource: 'suggestion',
    ...partial,
  };
}
