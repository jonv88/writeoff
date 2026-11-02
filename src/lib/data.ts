import type { ExpenseRecord, MerchantRule, Profile, ReceiptMeta } from './types';
import { defaultProfile } from './types';
import { fingerprint, normalize } from './core';
import { getSupabase } from './supabase';

type ProfileRow = {
  user_id: string;
  mode: Profile['mode'];
  worktype: Profile['worktype'];
  industry: Profile['industry'];
  country: string;
  name: string;
  complete: boolean;
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
    name: profile.name,
    complete: profile.complete,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function upsertExpense(userId: string, record: ExpenseRecord): Promise<ExpenseRecord> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase is not configured.');

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
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await sb.from('expenses').upsert(payload).select('*').single();
  if (error) throw error;
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

export async function uploadReceipt(
  userId: string,
  expenseId: string,
  file: File,
): Promise<ReceiptMeta> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase is not configured.');

  if (file.size > 3 * 1024 * 1024) {
    throw new Error('Choose a receipt smaller than 3 MB.');
  }
  if (
    !(
      /^image\/(jpeg|png|webp|gif|heic|heif)$/.test(file.type) ||
      file.type === 'application/pdf'
    )
  ) {
    throw new Error('Choose a photo or PDF receipt.');
  }

  const safeName = file.name.replace(/[^\w.\-]+/g, '_').slice(0, 120);
  const storagePath = `${userId}/${expenseId}/${Date.now()}-${safeName}`;

  const { error: upErr } = await sb.storage.from('receipts').upload(storagePath, file, {
    contentType: file.type,
    upsert: false,
  });
  if (upErr) throw upErr;

  // Replace any existing receipt row for this expense
  await sb.from('receipts').delete().eq('user_id', userId).eq('expense_id', expenseId);

  const { error: rowErr } = await sb.from('receipts').insert({
    user_id: userId,
    expense_id: expenseId,
    file_name: file.name,
    storage_path: storagePath,
    mime_type: file.type,
    size_bytes: file.size,
  });
  if (rowErr) {
    await sb.storage.from('receipts').remove([storagePath]);
    throw rowErr;
  }

  return {
    name: file.name,
    storagePath,
    mimeType: file.type,
    sizeBytes: file.size,
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

export async function importExpenses(userId: string, records: ExpenseRecord[]): Promise<number> {
  let saved = 0;
  for (const r of records) {
    await upsertExpense(userId, r);
    saved++;
  }
  return saved;
}
