/**
 * Server-side OCR provider adapters.
 * Provider API keys must never leave this function (env secrets only).
 *
 * Recommended default: Mindee Receipt OCR (V5) — free tier suitable for
 * development; see docs/RECEIPT_OCR.md.
 */

export interface OcrResult {
  merchant: string | null;
  date: string | null;
  total: number | null;
  currency: string | null;
  subtotal: number | null;
  tax: number | null;
  tip: number | null;
  confidence: number;
  rawTextPreview?: string;
  uncertainFields: string[];
  status: "ready" | "needs_details" | "failed" | "blocked";
  message: string;
  version: string;
  provider: string;
}

const VERSION = "ocr-mindee-2026.11.02";

function blocked(message: string, provider: string): OcrResult {
  return {
    merchant: null,
    date: null,
    total: null,
    currency: "USD",
    subtotal: null,
    tax: null,
    tip: null,
    confidence: 0,
    uncertainFields: ["merchant", "date", "total"],
    status: "blocked",
    message,
    version: VERSION,
    provider,
  };
}

function failed(message: string, provider: string): OcrResult {
  return {
    ...blocked(message, provider),
    status: "failed",
  };
}

function num(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "object" && v !== null && "value" in v) {
    const n = Number((v as { value: unknown }).value);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "object" && v !== null && "value" in v) {
    const s = String((v as { value: unknown }).value ?? "").trim();
    return s || null;
  }
  return null;
}

function conf(v: unknown): number {
  if (v && typeof v === "object" && "confidence" in v) {
    const c = Number((v as { confidence: unknown }).confidence);
    return Number.isFinite(c) ? c : 0;
  }
  return 0;
}

/** Normalize dates to YYYY-MM-DD when possible. */
function normalizeDate(raw: string | null): string | null {
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) {
    return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  }
  return raw;
}

async function mindeeReceipt(args: {
  bytes: Uint8Array;
  mimeType: string;
  fileName: string;
  apiKey: string;
}): Promise<OcrResult> {
  const provider = "mindee";
  const form = new FormData();
  form.append(
    "document",
    new Blob([args.bytes], { type: args.mimeType }),
    args.fileName || "receipt.jpg",
  );

  // Mindee Receipt V5 inference endpoint
  const res = await fetch(
    "https://api.mindee.net/v1/products/mindee/expense_receipts/v5/predict",
    {
      method: "POST",
      headers: { Authorization: `Token ${args.apiKey}` },
      body: form,
    },
  );

  if (!res.ok) {
    const text = await res.text();
    // Never echo API key material; truncate provider error.
    const snippet = text.slice(0, 200).replace(/Token\s+\S+/gi, "[redacted]");
    return failed(
      `OCR provider error (${res.status}). You can enter details manually. ${snippet}`,
      provider,
    );
  }

  const payload = await res.json();
  const doc =
    payload?.document?.inference?.prediction ||
    payload?.document?.inference?.pages?.[0]?.prediction ||
    {};

  const merchant = str(doc.supplier_name) || str(doc.supplier);
  const date = normalizeDate(str(doc.date));
  const total = num(doc.total_amount) ?? num(doc.total);
  const currency = str(doc.locale?.currency) || str(doc.currency) || "USD";
  const subtotal = num(doc.total_net) ?? num(doc.subtotal);
  const tax = num(doc.total_tax) ?? num(doc.taxes?.[0]);
  const tip = num(doc.tip);

  const scores = [
    conf(doc.supplier_name),
    conf(doc.date),
    conf(doc.total_amount),
  ].filter((c) => c > 0);
  const confidence = scores.length
    ? scores.reduce((a, b) => a + b, 0) / scores.length
    : 0;

  const uncertainFields: string[] = [];
  if (!merchant) uncertainFields.push("merchant");
  if (!date) uncertainFields.push("date");
  if (total == null) uncertainFields.push("total");
  if (confidence > 0 && confidence < 0.7) {
    if (merchant) uncertainFields.push("merchant");
    if (date) uncertainFields.push("date");
    if (total != null) uncertainFields.push("total");
  }

  const unique = [...new Set(uncertainFields)];
  return {
    merchant,
    date,
    total,
    currency: currency || "USD",
    subtotal,
    tax,
    tip,
    confidence,
    rawTextPreview: undefined,
    uncertainFields: unique,
    status: unique.length ? "needs_details" : "ready",
    message: unique.length
      ? "Some fields need a quick check before saving."
      : "Ready to review.",
    version: VERSION,
    provider,
  };
}

export async function runOcr(args: {
  bytes: Uint8Array;
  mimeType: string;
  fileName: string;
}): Promise<OcrResult> {
  const provider = (Deno.env.get("OCR_PROVIDER") || "mindee").toLowerCase();

  if (provider === "none") {
    return blocked(
      "OCR_PROVIDER=none. Enter details from the photo manually.",
      "none",
    );
  }

  if (provider === "mindee") {
    const apiKey = Deno.env.get("MINDEE_API_KEY")?.trim();
    if (!apiKey) {
      return blocked(
        "OCR not configured (missing MINDEE_API_KEY on the server). Enter details from the photo — extraction runs once the Mindee key is set in Edge Function secrets.",
        "mindee",
      );
    }
    try {
      return await mindeeReceipt({ ...args, apiKey });
    } catch (e) {
      return failed(
        `OCR call failed: ${e instanceof Error ? e.message : "unknown error"}. Enter details manually.`,
        "mindee",
      );
    }
  }

  return blocked(
    `Unknown OCR_PROVIDER="${provider}". Supported: mindee, none.`,
    provider,
  );
}
