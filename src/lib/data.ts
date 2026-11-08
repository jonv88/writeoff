import type { ExpenseRecord, MerchantRule, Profile, ReceiptMeta } from './types';
import { defaultProfile } from './types';
import { fingerprint, normalize } from './core';
import {
  ExpenseSaveError,
  assertReceiptUploadable,
  describeSaveFailure,
  receiptStoragePath,
  sanitizeSaveDiagnostic,
} from './expenseSave';
import { getSupabase } from './supabase';

type ProfileRow = {
  user_id: string;
  mode: Profile['mode'];
  worktype: Profile['worktype'];
  industry: Profile['industry'];
  country: string;
  name: string;
  complete: boolean;
  jurisdiction?: string | null;
  tax_year?: number | null;
  entity_type?: Profile['entityType'] | null;
};

type ExpenseRow = {
  id: string;
  merchant: string;
  amount_cents: number;
  expense_date: string;
  category: string;
  use_type: ExpenseRecord['type'];
  business_share: number;
  entity: string | null;
  notes: string | null;
  eligible_percent: number;
  eligibility_checked: boolean;
  reviewed: boolean;
  source: string;
  account_label: string | null;
  fingerprint: string | null;
  currency?: string | null;
  treatment_source?: ExpenseRecord['treatmentSource'] | null;
  suggested_status?: ExpenseRecord['suggestedStatus'] | null;
  suggestion_rule_id?: string | null;
  suggestion_rule_version?: string | null;
  suggestion_reason?: string | null;
  created_at: string;
  updated_at: string;
};

type ReceiptRow = {
  expense_id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
};

type RuleRow = {
  id: string;
  merchant_key: string;
  use_type: ExpenseRecord['type'];
  business_share: number;
  category: string;
};

function mapExpense(row: ExpenseRow, receipt: ReceiptMeta | null): ExpenseRecord {
  return {
    id: row.id,
    merchant: row.merchant,
    amount: row.amount_cents / 100,
    currency: row.currency || 'USD',
    date: row.expense_date,
    category: row.category,
    type: row.use_type,
    share: row.business_share,
    entity: row.entity || '',
    notes: row.notes || '',
    percent: Number(row.eligible_percent),
    eligibilityChecked: row.eligibility_checked,
    reviewed: row.reviewed,
    source: row.source,
    account: row.account_label || '',
    receipt,
    fingerprint: row.fingerprint || undefined,
    treatmentSource: row.treatment_source || 'suggestion',
    suggestedStatus: row.suggested_status || undefined,
    suggestionRuleId: row.suggestion_rule_id || undefined,
    suggestionRuleVersion: row.suggestion_rule_version || undefined,
    suggestionReason: row.suggestion_reason || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function loadWorkspace(userId: string): Promise<{
  profile: Profile;
  records: ExpenseRecord[];
  rules: MerchantRule[];
}> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase is not configured.');

  const [profileRes, expensesRes, receiptsRes, rulesRes] = await Promise.all([
    sb.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
    sb.from('expenses').select('*').eq('user_id', userId).order('expense_date', { ascending: false }),
    sb.from('receipts').select('*').eq('user_id', userId),
    sb.from('merchant_rules').select('*').eq('user_id', userId),
  ]);

  if (profileRes.error) throw profileRes.error;
  if (expensesRes.error) throw expensesRes.error;
  if (receiptsRes.error) throw receiptsRes.error;
  if (rulesRes.error) throw rulesRes.error;

  const receiptByExpense = new Map<string, ReceiptMeta>();
  for (const r of (receiptsRes.data || []) as ReceiptRow[]) {
    receiptByExpense.set(r.expense_id, {
      name: r.file_name,
      storagePath: r.storage_path,
      mimeType: r.mime_type || undefined,
      sizeBytes: r.size_bytes || undefined,
    });
  }

  const profileRow = profileRes.data as ProfileRow | null;
  const profile: Profile = profileRow
    ? {
        mode: profileRow.mode,
        worktype: profileRow.worktype,
        industry: profileRow.industry,
        country: profileRow.country,
        jurisdiction: profileRow.jurisdiction || '',
        taxYear: profileRow.tax_year || new Date().getFullYear(),
        entityType: profileRow.entity_type || 'unspecified',
        name: profileRow.name || '',
        complete: profileRow.complete,
      }
    : defaultProfile();

  const records = ((expensesRes.data || []) as ExpenseRow[]).map((row) =>
    mapExpense(row, receiptByExpense.get(row.id) || null),
  );

  const rules: MerchantRule[] = ((rulesRes.data || []) as RuleRow[]).map((r) => ({
    id: r.id,
    merchant: r.merchant_key,
    type: r.use_type,
    share: r.business_share,
    category: r.category,
  }));

  return { profile, records, rules };
}

export async function ensureProfile(userId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase is not configured.');
  const { error } = await sb.from('profiles').upsert(
    {
      user_id: userId,
      mode: 'Both',
      worktype: 'self',
      industry: 'general',
      country: 'US',
      name: '',
      complete: false,
    },
    { onConflict: 'user_id', ignoreDuplicates: true },
  );
  if (error) throw error;
}

export async function saveProfile(userId: string, profile: Profile): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase is not configured.');
  const { error } = await sb.from('profiles').upsert({
    user_id: userId,
    mode: profile.mode,
    worktype: profile.worktype,
    industry: profile.industry,
    country: profile.country,
    jurisdiction: profile.jurisdiction,
    tax_year: profile.taxYear,
    entity_type: profile.entityType,
    name: profile.name,
    complete: profile.complete,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/** Refresh a near-expiry session before a multi-step save. */
export async function ensureSaveSession(): Promise<{ userId: string }> {
  const sb = getSupabase();
  if (!sb) throw new ExpenseSaveError('Supabase is not configured.', { stage: 'auth', retryable: false });
  const { data: current, error: sessionError } = await sb.auth.getSession();
  if (sessionError) {
    throw new ExpenseSaveError(describeSaveFailure(sessionError, 'auth'), {
      stage: 'auth',
      cause: sessionError,
    });
  }
  let session = current.session;
  if (!session?.user?.id) {
    throw new ExpenseSaveError('Sign in again to save this expense. Your receipt details are still here.', {
      stage: 'auth',
      retryable: false,
    });
  }
  const expiresAtMs = session.expires_at ? session.expires_at * 1000 : 0;
  if (expiresAtMs && expiresAtMs - Date.now() < 120_000) {
    const { data: refreshed, error } = await sb.auth.refreshSession();
    if (error || !refreshed.session?.user?.id) {
      throw new ExpenseSaveError(
        'Your session expired. Sign in again, then tap Save expense. Your receipt details are still here.',
        { stage: 'auth', cause: error },
      );
    }
    session = refreshed.session;
  }
  return { userId: session.user.id };
}

async function expenseIdsWithoutReceipt(userId: string, expenseIds: string[]): Promise<string[]> {
  const sb = getSupabase();
  if (!sb || !expenseIds.length) return [];
  const { data: linked } = await sb
    .from('receipts')
    .select('expense_id')
    .eq('user_id', userId)
    .in('expense_id', expenseIds);
  const withReceipt = new Set((linked || []).map((row: { expense_id: string }) => row.expense_id));
  return expenseIds.filter((id) => !withReceipt.has(id));
}

/**
 * Reuse an expense that was created without a receipt photo (a prior partial save).
 * Only the signed-in owner's rows are considered.
 */
export async function findIncompleteReceiptExpense(
  userId: string,
  input: { merchant: string; date: string; amount: number; preferredId?: string | null },
): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const amountCents = Math.round(input.amount * 100);
  if (input.preferredId && /^[0-9a-f-]{36}$/i.test(input.preferredId)) {
    const missing = await expenseIdsWithoutReceipt(userId, [input.preferredId]);
    if (missing[0]) return missing[0];
  }
  const { data, error } = await sb
    .from('expenses')
    .select('id')
    .eq('user_id', userId)
    .eq('merchant', input.merchant)
    .eq('expense_date', input.date)
    .eq('amount_cents', amountCents)
    .order('created_at', { ascending: false })
    .limit(8);
  if (error || !data?.length) return null;
  const candidates = (data as Array<{ id: string }>).map((row) => row.id);
  const incomplete = await expenseIdsWithoutReceipt(userId, candidates);
  return incomplete[0] || null;
}

/** After a receipt is linked, drop same-amount incomplete siblings from earlier failed retries. */
export async function cleanupIncompleteSiblingExpenses(
  userId: string,
  keptExpenseId: string,
  input: { merchant: string; date: string; amount: number },
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const amountCents = Math.round(input.amount * 100);
  const { data } = await sb
    .from('expenses')
    .select('id')
    .eq('user_id', userId)
    .eq('merchant', input.merchant)
    .eq('expense_date', input.date)
    .eq('amount_cents', amountCents)
    .neq('id', keptExpenseId)
    .limit(20);
  const candidates = ((data || []) as Array<{ id: string }>).map((row) => row.id);
  const incomplete = await expenseIdsWithoutReceipt(userId, candidates);
  for (const id of incomplete) {
    await sb.from('expenses').delete().eq('user_id', userId).eq('id', id);
  }
}

export async function upsertExpense(userId: string, record: ExpenseRecord): Promise<ExpenseRecord> {
  const sb = getSupabase();
  if (!sb) throw new ExpenseSaveError('Supabase is not configured.', { stage: 'expense', retryable: false });

  const fp = fingerprint({
    date: record.date,
    merchant: record.merchant,
    amount: record.amount,
    account: record.account,
  });

  const payload = {
    id: record.id,
    user_id: userId,
    merchant: record.merchant,
    amount_cents: Math.round(record.amount * 100),
    expense_date: record.date,
    category: record.category,
    use_type: record.type,
    business_share: record.share,
    entity: record.entity || null,
    notes: record.notes || null,
    eligible_percent: record.percent,
    eligibility_checked: record.eligibilityChecked,
    reviewed: record.reviewed,
    source: record.source,
    account_label: record.account || null,
    fingerprint: fp,
    currency: record.currency || 'USD',
    treatment_source: record.treatmentSource || 'suggestion',
    suggested_status: record.suggestedStatus || null,
    suggestion_rule_id: record.suggestionRuleId || null,
    suggestion_rule_version: record.suggestionRuleVersion || null,
    suggestion_reason: record.suggestionReason || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await sb.from('expenses').upsert(payload).select('*').single();
  if (error) {
    throw new ExpenseSaveError(describeSaveFailure(error, 'expense'), {
      stage: 'expense',
      expenseId: record.id,
      cause: error,
    });
  }
  return mapExpense(data as ExpenseRow, record.receipt);
}

export async function deleteExpense(userId: string, expenseId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase is not configured.');

  // Delete receipt storage objects first (best-effort)
  const { data: receipts } = await sb
    .from('receipts')
    .select('storage_path')
    .eq('user_id', userId)
    .eq('expense_id', expenseId);

  if (receipts?.length) {
    const paths = receipts.map((r: { storage_path: string }) => r.storage_path);
    await sb.storage.from('receipts').remove(paths);
  }

  const { error } = await sb.from('expenses').delete().eq('user_id', userId).eq('id', expenseId);
  if (error) throw error;
}

/** Link an already-uploaded storage object (from extract-receipt) to an expense. */
export async function attachExistingReceipt(
  userId: string,
  expenseId: string,
  meta: ReceiptMeta,
): Promise<ReceiptMeta> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase is not configured.');
  if (!meta.storagePath || !meta.storagePath.startsWith(`${userId}/`)) {
    throw new Error('Receipt path is missing or not owned by this account.');
  }

  await sb.from('receipts').delete().eq('user_id', userId).eq('expense_id', expenseId);

  const { error } = await sb.from('receipts').insert({
    user_id: userId,
    expense_id: expenseId,
    file_name: meta.name,
    storage_path: meta.storagePath,
    mime_type: meta.mimeType || null,
    size_bytes: meta.sizeBytes || null,
  });
  if (error) throw error;
  return meta;
}

export async function uploadReceipt(
  userId: string,
  expenseId: string,
  file: File,
): Promise<ReceiptMeta> {
  const sb = getSupabase();
  if (!sb) throw new ExpenseSaveError('Supabase is not configured.', { stage: 'upload', retryable: false });

  let mime: string;
  try {
    mime = assertReceiptUploadable(file);
  } catch (err) {
    throw err instanceof ExpenseSaveError
      ? err
      : new ExpenseSaveError(describeSaveFailure(err, 'upload'), { stage: 'upload', expenseId, cause: err });
  }

  const storagePath = receiptStoragePath(userId, expenseId, mime);
  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch (err) {
    throw new ExpenseSaveError(describeSaveFailure(err, 'upload'), {
      stage: 'upload',
      expenseId,
      storagePath,
      cause: err,
    });
  }
  if (bytes.byteLength <= 0) {
    throw new ExpenseSaveError('That photo is empty.', { stage: 'upload', expenseId, retryable: false });
  }
  if (bytes.byteLength > 3 * 1024 * 1024) {
    throw new ExpenseSaveError('Choose a receipt smaller than 3 MB.', {
      stage: 'upload',
      expenseId,
      retryable: false,
    });
  }

  // ArrayBuffer upload avoids Safari FormData "Load failed" on canvas-prepared Files.
  const { error: upErr } = await sb.storage.from('receipts').upload(storagePath, bytes, {
    contentType: mime,
    upsert: true,
    cacheControl: '3600',
  });
  if (upErr) {
    console.info(
      'receipt-upload',
      sanitizeSaveDiagnostic({
        stage: 'upload',
        expenseId,
        storagePath,
        byteLength: bytes.byteLength,
        mimeType: mime,
        httpStatus: (() => {
          const code = (upErr as { statusCode?: unknown }).statusCode;
          const asNumber = typeof code === 'number' ? code : typeof code === 'string' ? Number(code) : NaN;
          return Number.isFinite(asNumber) ? asNumber : null;
        })(),
        errorName: upErr.name || 'StorageError',
        errorMessage: upErr.message || null,
      }),
    );
    throw new ExpenseSaveError(describeSaveFailure(upErr, 'upload'), {
      stage: 'upload',
      expenseId,
      storagePath,
      cause: upErr,
    });
  }

  await sb.from('receipts').delete().eq('user_id', userId).eq('expense_id', expenseId);

  const safeName = (file.name || 'receipt').replace(/[^\w.\-]+/g, '_').slice(0, 120) || 'receipt';
  const { error: rowErr } = await sb.from('receipts').insert({
    user_id: userId,
    expense_id: expenseId,
    file_name: safeName,
    storage_path: storagePath,
    mime_type: mime,
    size_bytes: bytes.byteLength,
  });
  if (rowErr) {
    await sb.storage.from('receipts').remove([storagePath]);
    console.info(
      'receipt-row',
      sanitizeSaveDiagnostic({
        stage: 'receipt_row',
        expenseId,
        storagePath,
        byteLength: bytes.byteLength,
        mimeType: mime,
        httpStatus: null,
        errorName: rowErr.name || 'PostgrestError',
        errorMessage: rowErr.message || null,
      }),
    );
    throw new ExpenseSaveError(describeSaveFailure(rowErr, 'receipt_row'), {
      stage: 'receipt_row',
      expenseId,
      storagePath,
      cause: rowErr,
    });
  }

  return {
    name: safeName,
    storagePath,
    mimeType: mime,
    sizeBytes: bytes.byteLength,
  };
}

export async function getReceiptSignedUrl(storagePath: string): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.storage.from('receipts').createSignedUrl(storagePath, 60);
  if (error) throw error;
  return data.signedUrl;
}

export async function saveMerchantRule(
  userId: string,
  rule: MerchantRule,
): Promise<MerchantRule> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase is not configured.');
  const merchant_key = normalize(rule.merchant);
  const { data, error } = await sb
    .from('merchant_rules')
    .upsert(
      {
        user_id: userId,
        merchant_key,
        use_type: rule.type,
        business_share: rule.share,
        category: rule.category,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,merchant_key' },
    )
    .select('*')
    .single();
  if (error) throw error;
  const row = data as RuleRow;
  return {
    id: row.id,
    merchant: row.merchant_key,
    type: row.use_type,
    share: row.business_share,
    category: row.category,
  };
}

export async function deleteMerchantRule(userId: string, ruleId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase is not configured.');
  const { error } = await sb.from('merchant_rules').delete().eq('user_id', userId).eq('id', ruleId);
  if (error) throw error;
}

function missingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === '42P01' || error.code === 'PGRST205' || /schema cache|does not exist|Could not find/i.test(error.message || '');
}

async function deleteOwnRows(
  sb: NonNullable<ReturnType<typeof getSupabase>>,
  table: string,
  userId: string,
  optional: boolean,
): Promise<void> {
  const { error } = await sb.from(table).delete().eq('user_id', userId);
  if (error && optional && (missingRelation(error) || error.code === '42501')) return;
  if (error) throw error;
}

/** Deletes this customer's rows. Browser storage is the caller's job, and only after this resolves. */
export async function deleteOwnedCloudAccount(userId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase is not configured.');
  if (!userId) throw new Error('Account deletion needs the signed-in customer.');

  await deleteOwnRows(sb, 'bank_items', userId, true);

  const { data, error } = await sb.from('receipts').select('storage_path').eq('user_id', userId);
  if (error) throw error;
  const paths = (data || []).map((row: { storage_path: string }) => row.storage_path).filter(Boolean);
  if (paths.length) {
    const removed = await sb.storage.from('receipts').remove(paths);
    if (removed.error) throw removed.error;
  }

  for (const table of ['receipts', 'expenses', 'merchant_rules'] as const) {
    await deleteOwnRows(sb, table, userId, false);
  }
  await deleteOwnRows(sb, 'entitlement_events', userId, true);
  await deleteOwnRows(sb, 'entitlements', userId, true);
  await deleteOwnRows(sb, 'profiles', userId, false);
}

export async function importExpenses(userId: string, records: ExpenseRecord[]): Promise<number> {
  let saved = 0;
  for (const r of records) {
    await upsertExpense(userId, r);
    saved++;
  }
  return saved;
}
