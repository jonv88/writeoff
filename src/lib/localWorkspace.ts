/**
 * Browser-local preview workspace — not cloud sync.
 * Used when the customer chooses Local preview (primary path without credentials).
 */
import type { ExpenseRecord, MerchantRule, Profile, WorkspaceState } from './types';
import { defaultProfile } from './types';

export const LOCAL_PREVIEW_KEY = 'writeoff.local.preview.v1';
export const LOCAL_PREVIEW_FLAG = 'writeoff.local.preview.active';

export function isLocalPreviewActive(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(LOCAL_PREVIEW_FLAG) === '1';
}

export function enableLocalPreview(): void {
  localStorage.setItem(LOCAL_PREVIEW_FLAG, '1');
  try {
    sessionStorage.setItem(LOCAL_PREVIEW_FLAG, '1');
  } catch {
    /* ignore */
  }
}

export function disableLocalPreview(): void {
  localStorage.removeItem(LOCAL_PREVIEW_FLAG);
  try {
    sessionStorage.removeItem(LOCAL_PREVIEW_FLAG);
  } catch {
    /* ignore */
  }
}

export function loadLocalWorkspace(): WorkspaceState {
  try {
    const raw = localStorage.getItem(LOCAL_PREVIEW_KEY);
    if (!raw) {
      return { records: [], profile: defaultProfile(), rules: [] };
    }
    const parsed = JSON.parse(raw) as Partial<WorkspaceState>;
    return {
      records: Array.isArray(parsed.records) ? (parsed.records as ExpenseRecord[]) : [],
      profile: { ...defaultProfile(), ...(parsed.profile || {}) },
      rules: Array.isArray(parsed.rules) ? (parsed.rules as MerchantRule[]) : [],
    };
  } catch {
    return { records: [], profile: defaultProfile(), rules: [] };
  }
}

export function saveLocalWorkspace(state: WorkspaceState): void {
  localStorage.setItem(LOCAL_PREVIEW_KEY, JSON.stringify(state));
}

export function clearLocalWorkspaceData(): void {
  localStorage.removeItem(LOCAL_PREVIEW_KEY);
}

export function emptyLocalWorkspace(): WorkspaceState {
  return { records: [], profile: defaultProfile(), rules: [] };
}

/** Synthetic fixtures for demo — not creator or personal financial data. */
export function seedDemoFixtures(): WorkspaceState {
  const profile: Profile = {
    ...defaultProfile(),
    mode: 'Both',
    worktype: 'self',
    industry: 'creative',
    country: 'US',
    jurisdiction: 'CA',
    taxYear: 2026,
    entityType: 'sole_prop',
    name: 'Demo Studio',
    complete: true,
  };
  const records: ExpenseRecord[] = [
    {
      id: 'demo-adobe',
      merchant: 'Adobe Creative Cloud',
      amount: 59.99,
      currency: 'USD',
      date: '2026-10-15',
      category: 'Software & subscriptions',
      type: 'Unsorted',
      share: 0,
      entity: 'Demo Studio',
      notes: '',
      percent: 0,
      eligibilityChecked: false,
      reviewed: false,
      source: 'Manual expense',
      account: '',
      receipt: null,
      treatmentSource: 'suggestion',
    },
    {
      id: 'demo-uber',
      merchant: 'Uber Trip',
      amount: 24.5,
      currency: 'USD',
      date: '2026-10-18',
      category: 'Travel & transport',
      type: 'Unsorted',
      share: 0,
      entity: '',
      notes: '',
      percent: 0,
      eligibilityChecked: false,
      reviewed: false,
      source: 'CSV import',
      account: 'Demo card',
      receipt: null,
      treatmentSource: 'suggestion',
    },
    {
      id: 'demo-coffee',
      merchant: 'Starbucks',
      amount: 6.75,
      currency: 'USD',
      date: '2026-10-20',
      category: 'Meals',
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
    },
    {
      id: 'demo-staples',
      merchant: 'Staples',
      amount: 42.18,
      currency: 'USD',
      date: '2026-10-12',
      category: 'Office & supplies',
      type: 'Unsorted',
      share: 0,
      entity: 'Demo Studio',
      notes: '',
      percent: 0,
      eligibilityChecked: false,
      reviewed: false,
      source: 'Manual expense',
      account: '',
      receipt: null,
      treatmentSource: 'suggestion',
    },
  ];
  return { records, profile, rules: [] };
}
