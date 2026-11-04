/**
 * Legacy browser-storage migration path (Phase A documentation + detection).
 *
 * The original prototype stored data in:
 *   - writeoff.workspace.v2  → { records, profile, rules }
 *   - writeoff.records.v1    → ExpenseRecord[] (legacy)
 *
 * Phase A behavior:
 * - Detect local keys when a signed-in customer opens Setup.
 * - Offer an explicit preview + import into the authenticated account.
 * - Never silently upload browser financial data on sign-in.
 * - Do not clear browser storage until the server confirms success.
 * - Keep prototype data intact on failure.
 */

import type { ExpenseRecord, MerchantRule, Profile, WorkspaceState } from './types';
import { defaultProfile } from './types';
import { parseDate } from './core';

export const LEGACY_WORKSPACE_KEY = 'writeoff.workspace.v2';
export const LEGACY_RECORDS_KEY = 'writeoff.records.v1';

export interface LegacyDetection {
  present: boolean;
  source: 'workspace.v2' | 'records.v1' | null;
  recordCount: number;
  hasProfile: boolean;
  hasRules: boolean;
  preview: WorkspaceState | null;
  error: string | null;
}

function isRecordLike(r: unknown): r is ExpenseRecord {
  if (!r || typeof r !== 'object') return false;
  const o = r as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.merchant === 'string' &&
    typeof o.amount === 'number' &&
    Number.isFinite(o.amount) &&
    o.amount > 0 &&
    typeof o.date === 'string' &&
    !!parseDate(o.date)
  );
}

export function detectLegacyLocalStorage(): LegacyDetection {
  if (typeof localStorage === 'undefined') {
    return {
      present: false,
      source: null,
      recordCount: 0,
      hasProfile: false,
      hasRules: false,
      preview: null,
      error: null,
    };
  }

  try {
    const rawV2 = localStorage.getItem(LEGACY_WORKSPACE_KEY);
    if (rawV2) {
      const parsed = JSON.parse(rawV2) as Partial<WorkspaceState>;
      if (!Array.isArray(parsed.records)) {
        return {
          present: true,
          source: 'workspace.v2',
          recordCount: 0,
          hasProfile: false,
          hasRules: false,
          preview: null,
          error: 'Saved workspace could not be read. Nothing was imported.',
        };
      }
      const records = parsed.records.filter(isRecordLike).map((r) => ({
        ...r,
        type: r.type || 'Unsorted',
        share: r.share ?? 0,
        entity: r.entity || '',
        notes: r.notes || '',
        percent: r.percent ?? 0,
        eligibilityChecked: !!r.eligibilityChecked,
        reviewed: !!r.reviewed,
        source: r.source || 'Browser import',
        account: r.account || '',
        receipt: null, // receipt data URLs are not auto-uploaded; attach after import
        category: r.category || 'Other',
      }));
      const profile: Profile = {
        ...defaultProfile(),
        ...(parsed.profile || {}),
      };
      const rules: MerchantRule[] = Array.isArray(parsed.rules)
        ? parsed.rules.filter(
            (x): x is MerchantRule =>
              !!x &&
              typeof x === 'object' &&
              typeof (x as MerchantRule).merchant === 'string' &&
              typeof (x as MerchantRule).type === 'string',
          )
        : [];
      return {
        present: records.length > 0 || profile.complete || rules.length > 0,
        source: 'workspace.v2',
        recordCount: records.length,
        hasProfile: !!parsed.profile,
        hasRules: rules.length > 0,
        preview: { records, profile, rules },
        error: null,
      };
    }

    const rawV1 = localStorage.getItem(LEGACY_RECORDS_KEY);
    if (rawV1) {
      const legacy = JSON.parse(rawV1) as unknown;
      if (!Array.isArray(legacy)) {
        return {
          present: true,
          source: 'records.v1',
          recordCount: 0,
          hasProfile: false,
          hasRules: false,
          preview: null,
          error: 'Legacy records could not be read.',
        };
      }
      const records = legacy.filter(isRecordLike).map((r) => ({
        ...r,
        reviewed: false,
        source: 'Previous version',
        eligibilityChecked: false,
        receipt: null,
        type: r.type || 'Unsorted',
        share: r.share ?? 0,
        entity: r.entity || '',
        notes: r.notes || '',
        percent: r.percent ?? 0,
        account: r.account || '',
        category: r.category || 'Other',
      }));
      return {
        present: records.length > 0,
        source: 'records.v1',
        recordCount: records.length,
        hasProfile: false,
        hasRules: false,
        preview: { records, profile: defaultProfile(), rules: [] },
        error: null,
      };
    }

    return {
      present: false,
      source: null,
      recordCount: 0,
      hasProfile: false,
      hasRules: false,
      preview: null,
      error: null,
    };
  } catch {
    return {
      present: true,
      source: null,
      recordCount: 0,
      hasProfile: false,
      hasRules: false,
      preview: null,
      error: 'Browser storage could not be parsed. Nothing was imported.',
    };
  }
}

/** Clears legacy keys only after the caller confirms server persistence succeeded. */
export function clearLegacyLocalStorage(): void {
  localStorage.removeItem(LEGACY_WORKSPACE_KEY);
  localStorage.removeItem(LEGACY_RECORDS_KEY);
}
