/**
 * Receipt reading through the OpenAI API on the private preview.
 * The key stays on the server. Veryfi is not called from this module.
 * Pro API credits apply only to the linked OpenAI organization, so the
 * request goes to api.openai.com with that organization's key.
 */
import type { ReceiptReading } from '../lib/ocr/receiptEvidence.ts';
import {
  MAX_OUTPUT_TOKENS,
  PROVIDER_ATTEMPTS,
  REQUEST_TIMEOUT_MS,
  maxImageInputTokens,
  openAiMonthlyBudgetCents,
  sanitizeOpenAiUsage,
  tokenCents,
  FAST_INPUT_CENTS_PER_MILLION,
  FAST_OUTPUT_CENTS_PER_MILLION,
  type SanitizedOpenAiUsage,
} from './openaiCost.ts';

export const OPENAI_RECEIPT_BRANCH = 'feat/plaid-sandbox';
export const DEFAULT_OPENAI_MONTHLY_CAP = 60;
export const DEFAULT_OPENAI_CUSTOMER_CAP = 20;
export const DEFAULT_OPENAI_MODEL = 'gpt-4.1-mini';
export const OPENAI_MODEL_SNAPSHOT = 'gpt-4.1-mini-2025-04-14';
export { MAX_OUTPUT_TOKENS, PROVIDER_ATTEMPTS, REQUEST_TIMEOUT_MS };

const RECEIPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    merchant: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    merchantQuote: { type: 'string' },
    date: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    dateQuote: { type: 'string' },
    total: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    totalQuote: { type: 'string' },
    currency: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    items: { type: 'array', items: { type: 'string' } },
  },
  required: ['merchant', 'merchantQuote', 'date', 'dateQuote', 'total', 'totalQuote', 'currency', 'items'],
} as const;

const PROMPT = [
  'Read this receipt image.',
  'Return the merchant, the purchase date as YYYY-MM-DD, and the final amount the customer paid after tax.',
  'Do not use a subtotal, tax, tip, cash tendered, change, or rewards balance as the final amount.',
  'For each field, copy the exact words from the receipt that support it.',
  'If a field is not visible, use null and an empty quote.',
  'Do not guess a merchant, date, or amount that is not printed on the receipt.',
].join(' ');

export type OpenAiReceiptEnv = {
  VERCEL_ENV?: string;
  VERCEL_GIT_COMMIT_REF?: string;
  RECEIPT_READER?: string;
  OPENAI_API_KEY?: string;
  OPENAI_RECEIPT_MODEL?: string;
  OPENAI_RECEIPT_MONTHLY_BUDGET_CENTS?: string;
  OPENAI_RECEIPT_MONTHLY_CAP?: string;
  OPENAI_RECEIPT_CUSTOMER_CAP?: string;
};

export type OpenAiReceiptResult = {
  reading: ReceiptReading;
  usage: SanitizedOpenAiUsage | null;
  outcome: 'completed';
  httpStatus: number;
  attempts: 1;
};

/** Reader is selected for this deployment. The budget may still be closed. */
export function openAiReaderRequested(env: OpenAiReceiptEnv): boolean {
  if (env.VERCEL_ENV === 'production') return false;
  if (env.RECEIPT_READER !== 'openai') return false;
  if (env.VERCEL_GIT_COMMIT_REF && env.VERCEL_GIT_COMMIT_REF !== OPENAI_RECEIPT_BRANCH) return false;
  return true;
}

export function openAiModel(env: OpenAiReceiptEnv): string | null {
  const model = (env.OPENAI_RECEIPT_MODEL || DEFAULT_OPENAI_MODEL).trim();
  if (model !== DEFAULT_OPENAI_MODEL && model !== OPENAI_MODEL_SNAPSHOT) return null;
  return model;
}

export function openAiCountCaps(env: OpenAiReceiptEnv): { customer: number; global: number } {
  return {
    customer: Math.min(positiveCap(env.OPENAI_RECEIPT_CUSTOMER_CAP, DEFAULT_OPENAI_CUSTOMER_CAP), DEFAULT_OPENAI_CUSTOMER_CAP),
    global: Math.min(positiveCap(env.OPENAI_RECEIPT_MONTHLY_CAP, DEFAULT_OPENAI_MONTHLY_CAP), DEFAULT_OPENAI_MONTHLY_CAP),
  };
}

export function buildOpenAiRequest(model: string, imageDataUrl: string) {
  return {
    model,
    max_output_tokens: MAX_OUTPUT_TOKENS,
    input: [{
      role: 'user',
      content: [
        { type: 'input_text', text: PROMPT },
        { type: 'input_image', image_url: imageDataUrl },
      ],
    }],
    text: {
      format: {
        type: 'json_schema',
        name: 'receipt_fields',
        strict: true,
        schema: RECEIPT_SCHEMA,
      },
    },
  };
}

/** One byte per token, plus framing room, for every non-image byte in the request. */
export function textTokenCeiling(): number {
  const json = JSON.stringify(buildOpenAiRequest(OPENAI_MODEL_SNAPSHOT, ''));
  return new TextEncoder().encode(json).length + 256;
}

/** Fast-tier cents reserved before the provider is contacted. */
export function openAiReserveCents(): number {
  return tokenCents(
    maxImageInputTokens() + textTokenCeiling(),
    MAX_OUTPUT_TOKENS,
    FAST_INPUT_CENTS_PER_MILLION,
    FAST_OUTPUT_CENTS_PER_MILLION,
  );
}

export const OPENAI_RESERVE_CENTS = openAiReserveCents();

export function openaiReaderEnabled(env: OpenAiReceiptEnv): boolean {
  if (!openAiReaderRequested(env)) return false;
  if (!env.OPENAI_API_KEY?.trim()) return false;
  if (!openAiModel(env)) return false;
  const budget = openAiMonthlyBudgetCents(env);
  return budget != null && budget >= OPENAI_RESERVE_CENTS;
}

export function openAiDisabledReason(env: OpenAiReceiptEnv): 'budget' | 'off' {
  if (!env.OPENAI_API_KEY?.trim() || !openAiModel(env)) return 'off';
  const budget = openAiMonthlyBudgetCents(env);
  if (budget == null || budget < OPENAI_RESERVE_CENTS) return 'budget';
  return 'off';
}

export function positiveCap(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
}

type ModelReceipt = {
  merchant: string | null;
  merchantQuote: string;
  date: string | null;
  dateQuote: string;
  total: number | null;
  totalQuote: string;
  currency: string | null;
  items: string[];
};

function asText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function quoteHas(quote: string, needle: string): boolean {
  const hay = quote.toLowerCase().replace(/\s+/g, ' ');
  const pin = needle.toLowerCase().replace(/\s+/g, ' ').trim();
  return Boolean(pin) && hay.includes(pin);
}

function realDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function dateQuoted(date: string, quote: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return false;
  const year = match[1];
  const month = String(Number(match[2]));
  const day = String(Number(match[3]));
  const hay = quote.toLowerCase();
  if (!hay.includes(year)) return false;
  const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const monthOk = hay.includes(month) || hay.includes(match[2]) || hay.includes(monthNames[Number(match[2]) - 1] || '');
  const dayOk = hay.includes(day) || hay.includes(match[3]);
  return monthOk && dayOk;
}

function totalQuoted(total: number, quote: string): boolean {
  const amount = total.toFixed(2);
  const alt = amount.replace('.', ',');
  return quote.split('\n').some((line) => {
    if (!line.includes(amount) && !line.includes(alt)) return false;
    const subtotal = /\bsub\s*total\b/i.test(line);
    const finalLabel = /\b(grand\s*total|final\s*total|amount\s+paid|balance\s+due|amount\s+due)\b/i.test(line)
      || (/\btotal\b/i.test(line) && !subtotal);
    return finalLabel;
  });
}

/** Keep a model field only when the receipt quote contains it. */
export function acceptOpenAiReceipt(raw: unknown): ReceiptReading {
  const row = raw && typeof raw === 'object' ? raw as Partial<ModelReceipt> : {};
  const merchantQuote = asText(row.merchantQuote);
  const dateQuote = asText(row.dateQuote);
  const totalQuote = typeof row.totalQuote === 'string' ? row.totalQuote : '';
  const proposedMerchant = asText(row.merchant);
  const merchant = proposedMerchant && quoteHas(merchantQuote, proposedMerchant) ? proposedMerchant.slice(0, 100) : null;
  const proposedDate = asText(row.date);
  const date = proposedDate && realDate(proposedDate) && dateQuoted(proposedDate, dateQuote) ? proposedDate : null;
  const proposedTotal = typeof row.total === 'number' && Number.isFinite(row.total) ? row.total : null;
  const total = proposedTotal != null && proposedTotal > 0 && proposedTotal < 100_000 && totalQuoted(proposedTotal, totalQuote)
    ? Math.round(proposedTotal * 100) / 100
    : null;
  const currency = asText(row.currency).toUpperCase();
  const itemQuote = `${merchantQuote}\n${dateQuote}\n${totalQuote}`;
  const items = (Array.isArray(row.items) ? row.items : [])
    .map((item) => asText(item))
    .filter((name) => name && quoteHas(itemQuote, name))
    .slice(0, 12)
    .map((name) => ({ name: name.slice(0, 80) }));
  const uncertain: Array<'merchant' | 'date' | 'total'> = [];
  if (!merchant) uncertain.push('merchant');
  if (!date) uncertain.push('date');
  if (total == null) uncertain.push('total');
  return {
    merchant,
    date,
    total,
    currency: /^[A-Z]{3}$/.test(currency) ? currency : 'USD',
    uncertainFields: uncertain,
    fieldHints: {
      ...(merchant ? {} : { merchant: 'Confirm the merchant name' }),
      ...(date ? {} : { date: 'Confirm the purchase date' }),
      ...(total == null ? { total: 'Confirm the final amount paid' } : {}),
    },
    message: uncertain.length
      ? 'Some fields need a quick check before saving.'
      : 'Review the details before saving.',
    status: 'needs_details',
    items,
  };
}

export function outputText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const record = payload as { output_text?: unknown; output?: unknown };
  if (typeof record.output_text === 'string') return record.output_text;
  if (!Array.isArray(record.output)) return '';
  const parts: string[] = [];
  for (const item of record.output) {
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      const text = (part as { text?: unknown }).text;
      if (typeof text === 'string') parts.push(text);
    }
  }
  return parts.join('');
}

export class OpenAiReceiptError extends Error {
  readonly outcome: 'failed' | 'timeout';
  readonly httpStatus: number | null;

  constructor(message: string, outcome: 'failed' | 'timeout' = 'failed', httpStatus: number | null = null) {
    super(message);
    this.name = 'OpenAiReceiptError';
    this.outcome = outcome;
    this.httpStatus = httpStatus;
  }
}

export async function readReceiptWithOpenAi(
  bytes: Uint8Array,
  mime: 'image/jpeg' | 'image/png' | 'image/webp',
  apiKey: string,
  model: string,
  fetchImpl: typeof fetch,
): Promise<OpenAiReceiptResult> {
  const image = Buffer.from(bytes).toString('base64');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildOpenAiRequest(model, `data:${mime};base64,${image}`)),
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    throw new OpenAiReceiptError(
      'Receipt reading did not finish. Review the photo on this device.',
      aborted ? 'timeout' : 'failed',
    );
  } finally {
    clearTimeout(timer);
  }
  if (response.status === 401 || response.status === 403) {
    throw new OpenAiReceiptError('Receipt reading is not available.', 'failed', response.status);
  }
  if (response.status === 429) {
    throw new OpenAiReceiptError('Receipt reading is busy. Review the photo on this device.', 'failed', response.status);
  }
  if (!response.ok) {
    throw new OpenAiReceiptError('Receipt reading failed before a result came back.', 'failed', response.status);
  }
  const payload = await response.json().catch(() => null);
  const text = outputText(payload);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new OpenAiReceiptError('Receipt reading failed before a result came back.', 'failed', response.status);
  }
  return {
    reading: acceptOpenAiReceipt(parsed),
    usage: sanitizeOpenAiUsage(payload),
    outcome: 'completed',
    httpStatus: response.status,
    attempts: PROVIDER_ATTEMPTS,
  };
}
