/**
 * List-price ceiling for one gpt-4.1-mini receipt read.
 * Prices were read from OpenAI and Stripe docs on 2026-11-07.
 * This is not an invoice, a credit balance, or an account-wide cap.
 *
 * Image tokens: 32px patches, 1.62 multiplier, 2048px max edge, 6144 patch budget.
 * https://developers.openai.com/api/docs/guides/images-vision
 * Standard gpt-4.1-mini: $0.40 / $1.60 per 1M input/output tokens.
 * Fast (formerly priority): $0.70 / $2.80. The request omits service_tier,
 * so the reserve uses Fast because the project default is unverified.
 * https://developers.openai.com/api/docs/pricing
 * Stripe US domestic cards: 2.9% + 30¢. Billing pay as you go: 0.7% of volume.
 * https://stripe.com/pricing and https://stripe.com/billing/pricing
 */

export const STANDARD_INPUT_CENTS_PER_MILLION = 40;
export const STANDARD_OUTPUT_CENTS_PER_MILLION = 160;
export const FAST_INPUT_CENTS_PER_MILLION = 70;
export const FAST_OUTPUT_CENTS_PER_MILLION = 280;

export const IMAGE_PATCH_PX = 32;
export const IMAGE_MULTIPLIER_MILLI = 1620;
export const IMAGE_MAX_EDGE = 2048;
export const IMAGE_PATCH_BUDGET = 6144;
export const CLIENT_MAX_EDGE = 1600;

export const MAX_OUTPUT_TOKENS = 700;
export const REQUEST_TIMEOUT_MS = 25_000;
export const PROVIDER_ATTEMPTS = 1;

export type SanitizedOpenAiUsage = {
  inputTokens: number;
  outputTokens: number;
  imageTokens: number | null;
  cachedTokens: number | null;
  /** Fast-tier cents, cache discount ignored. Null tokens never reach this field. */
  measuredFastCents: number;
};

function wholeCount(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 2_000_000) return null;
  return value;
}

/** Keep numeric usage only. Receipt text and quotes are dropped. */
export function sanitizeOpenAiUsage(payload: unknown): SanitizedOpenAiUsage | null {
  if (!payload || typeof payload !== 'object') return null;
  const usage = (payload as { usage?: unknown }).usage;
  if (!usage || typeof usage !== 'object') return null;
  const record = usage as Record<string, unknown>;
  const inputTokens = wholeCount(record.input_tokens);
  const outputTokens = wholeCount(record.output_tokens);
  if (inputTokens == null || outputTokens == null) return null;
  const details = record.input_tokens_details;
  let imageTokens: number | null = null;
  let cachedTokens: number | null = null;
  if (details && typeof details === 'object') {
    const row = details as Record<string, unknown>;
    imageTokens = wholeCount(row.image_tokens);
    cachedTokens = wholeCount(row.cached_tokens);
  }
  return {
    inputTokens,
    outputTokens,
    imageTokens,
    cachedTokens,
    measuredFastCents: tokenCents(inputTokens, outputTokens, FAST_INPUT_CENTS_PER_MILLION, FAST_OUTPUT_CENTS_PER_MILLION),
  };
}

/** Ceil of list-price cents. Rates are cents per 1M tokens. */
export function tokenCents(inputTokens: number, outputTokens: number, inputRate: number, outputRate: number): number {
  if (inputTokens < 0 || outputTokens < 0) return 0;
  const numerator = inputTokens * inputRate + outputTokens * outputRate;
  if (numerator <= 0) return 0;
  return Math.ceil(numerator / 1_000_000);
}

function fitEdge(width: number, height: number): { width: number; height: number } {
  const edge = Math.max(width, height);
  if (edge <= IMAGE_MAX_EDGE) return { width: Math.max(1, width), height: Math.max(1, height) };
  const scale = IMAGE_MAX_EDGE / edge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Billable image input tokens before the one-token billing cushion. */
export function imageTokensForDimensions(width: number, height: number): number {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return 0;
  const fitted = fitEdge(Math.floor(width), Math.floor(height));
  let patches = Math.ceil(fitted.width / IMAGE_PATCH_PX) * Math.ceil(fitted.height / IMAGE_PATCH_PX);
  if (patches > IMAGE_PATCH_BUDGET) patches = IMAGE_PATCH_BUDGET;
  const product = patches * IMAGE_MULTIPLIER_MILLI;
  return Math.floor((product + 999) / 1000);
}

/**
 * Largest image the model will bill: a 2048 square is 4096 patches,
 * under the 6144 budget, times 1.62, plus one token of documented billing variance.
 */
export function maxImageInputTokens(): number {
  return imageTokensForDimensions(IMAGE_MAX_EDGE, IMAGE_MAX_EDGE) + 1;
}

/** On-device photos are resized to this edge before a normal upload. */
export function preparedImageInputTokens(): number {
  return imageTokensForDimensions(CLIENT_MAX_EDGE, CLIENT_MAX_EDGE) + 1;
}

/**
 * Monthly budget in cents. Missing, blank, or non-integer means no budget
 * was authorized. Zero is an explicit empty budget, not a default.
 */
export function openAiMonthlyBudgetCents(env: { OPENAI_RECEIPT_MONTHLY_BUDGET_CENTS?: string }): number | null {
  const raw = env.OPENAI_RECEIPT_MONTHLY_BUDGET_CENTS;
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!/^\d{1,9}$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value)) return null;
  return value;
}

/** US domestic card list fees for the approved monthly price. Microdollars. */
export function listedDomesticFees(priceCents = 999) {
  const priceMicro = priceCents * 10_000;
  const paymentsMicro = priceCents * 290 + 30 * 10_000;
  const billingMicro = priceCents * 70;
  return {
    priceMicro,
    paymentsMicro,
    billingMicro,
    beforeOcrMicro: priceMicro - paymentsMicro - billingMicro,
  };
}
