import { BILLING_PRODUCT_ID } from '../lib/billing/plan.ts';
import { accessAllowed, type EntitlementState } from '../lib/billing/sandboxEntitlements.ts';
import { customerFromRequest, type CustomerRequest } from './customerRequest.ts';
import { openAiCountCaps, OPENAI_RESERVE_CENTS } from './openaiReceipt.ts';
import { openAiMonthlyBudgetCents } from './openaiCost.ts';
import type { OpenAiUsageRecord, SpendDecision } from './openaiSpendLedger.ts';
import { CLOUD_SCANS_PER_CUSTOMER_MONTH, createRateLimiter, globalScanBudget } from './veryfiPolicy.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

const allow = createRateLimiter();

export function scanRequestAllowed(ownerId: string): boolean {
  return allow(ownerId);
}

export async function resolveScanCustomer(req: CustomerRequest, env: Record<string, string | undefined>) {
  try {
    const customer = await customerFromRequest(req, env);
    const { data, error } = await customer.client
      .from('entitlements')
      .select('state,expires_at')
      .eq('user_id', customer.ownerId)
      .eq('product_id', BILLING_PRODUCT_ID)
      .maybeSingle();
    if (error || !data) return { ownerId: customer.ownerId, entitled: false, client: customer.client };
    const entitled = accessAllowed({
      ownerId: customer.ownerId,
      productId: BILLING_PRODUCT_ID,
      state: data.state as EntitlementState,
      expiresAt: data.expires_at,
      lastEventId: '',
      lastEventAt: '',
    }, new Date().toISOString());
    return { ownerId: customer.ownerId, entitled, client: customer.client };
  } catch {
    return null;
  }
}

export async function consumeScanAllowance(
  client: SupabaseClient,
  ownerId: string,
  env: { VERYFI_GLOBAL_MONTHLY_CAP?: string },
): Promise<boolean> {
  const month = new Date().toISOString().slice(0, 7);
  const { data, error } = await client.rpc('reserve_scan_attempt', {
    p_owner: ownerId,
    p_month: month,
    p_customer_cap: CLOUD_SCANS_PER_CUSTOMER_MONTH,
    p_global_cap: globalScanBudget(env),
  });
  return !error && data === true;
}

function spendDecision(data: unknown): SpendDecision {
  let row = data;
  if (typeof data === 'string') {
    try {
      row = JSON.parse(data) as unknown;
    } catch {
      return { ok: false, reason: 'budget' };
    }
  }
  if (!row || typeof row !== 'object') return { ok: false, reason: 'budget' };
  const record = row as { ok?: unknown; reason?: unknown; attemptId?: unknown; reservedCents?: unknown };
  if (record.ok === true && typeof record.attemptId === 'string') {
    const reserved = Number(record.reservedCents);
    return { ok: true, attemptId: record.attemptId, reservedCents: Number.isFinite(reserved) ? reserved : OPENAI_RESERVE_CENTS };
  }
  if (record.reason === 'cap' || record.reason === 'budget' || record.reason === 'unconfigured') {
    return { ok: false, reason: record.reason };
  }
  return { ok: false, reason: 'budget' };
}

/** Reserve one ChatGPT read against the count caps and the explicit dollar budget. */
export async function reserveOpenAiScan(
  client: SupabaseClient,
  ownerId: string,
  env: {
    OPENAI_RECEIPT_MONTHLY_CAP?: string;
    OPENAI_RECEIPT_CUSTOMER_CAP?: string;
    OPENAI_RECEIPT_MONTHLY_BUDGET_CENTS?: string;
  },
): Promise<SpendDecision> {
  const budget = openAiMonthlyBudgetCents(env);
  if (budget == null) return { ok: false, reason: 'unconfigured' };
  if (budget < OPENAI_RESERVE_CENTS) return { ok: false, reason: 'budget' };
  const caps = openAiCountCaps(env);
  const month = new Date().toISOString().slice(0, 7);
  const { data, error } = await client.rpc('reserve_openai_receipt', {
    p_owner: ownerId,
    p_month: month,
    p_customer_cap: caps.customer,
    p_global_cap: caps.global,
    p_budget_cents: budget,
    p_reserve_cents: OPENAI_RESERVE_CENTS,
  });
  if (error) return { ok: false, reason: 'budget' };
  return spendDecision(data);
}

/** Store token counts after a reserved read. Receipt text is not accepted. */
export async function recordOpenAiScanUsage(
  client: SupabaseClient,
  attemptId: string,
  usage: OpenAiUsageRecord,
): Promise<void> {
  await client.rpc('record_openai_receipt_usage', {
    p_attempt: attemptId,
    p_outcome: usage.outcome,
    p_model: usage.model,
    p_input_tokens: usage.inputTokens,
    p_output_tokens: usage.outputTokens,
    p_image_tokens: usage.imageTokens,
    p_measured_cents: usage.measuredCents,
    p_latency_ms: usage.latencyMs,
    p_http_status: usage.httpStatus,
    p_byte_length: usage.byteLength,
  });
}
