/**
 * extract-receipt — authenticated receipt upload + OCR.
 *
 * - Requires a valid customer JWT (Supabase Auth).
 * - Validates MIME type and size (≤ 3 MB).
 * - Stores the file in the private `receipts` bucket under `{userId}/…`.
 * - Calls the configured OCR provider adapter (Mindee by default).
 * - Never returns provider API keys or service-role credentials.
 *
 * Server env (Dashboard → Edge Functions → Secrets):
 *   MINDEE_API_KEY          — required for real extraction
 *   OCR_PROVIDER            — "mindee" (default) | "none"
 *   SUPABASE_URL            — usually injected
 *   SUPABASE_ANON_KEY       — usually injected
 *   SUPABASE_SERVICE_ROLE_KEY — usually injected (storage write as owner path)
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { runOcr } from "./ocr.ts";

const VERSION = "extract-receipt-2026.11.02";
const MAX_BYTES = 3 * 1024 * 1024;
const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function safeName(name: string) {
  return name.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "receipt";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed", version: VERSION }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Missing authorization", version: VERSION }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json(
      {
        status: "failed",
        message: "Server misconfigured (missing Supabase env).",
        version: VERSION,
      },
      500,
    );
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();
  if (userErr || !user) {
    return json({ error: "Unauthorized", version: VERSION }, 401);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "Expected multipart form data", version: VERSION }, 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return json({ error: "Missing file field", version: VERSION }, 400);
  }
  if (file.size <= 0 || file.size > MAX_BYTES) {
    return json(
      { error: "Choose a receipt smaller than 3 MB.", version: VERSION },
      400,
    );
  }
  const mime = file.type || "application/octet-stream";
  if (!ALLOWED.has(mime)) {
    return json(
      { error: "Choose a photo or PDF receipt.", version: VERSION },
      400,
    );
  }

  const expenseIdRaw = String(form.get("expense_id") || "draft");
  const expenseId = /^[a-zA-Z0-9_-]+$/.test(expenseIdRaw)
    ? expenseIdRaw
    : "draft";
  const path = `${user.id}/${expenseId}/${Date.now()}-${safeName(file.name)}`;

  const admin = createClient(supabaseUrl, serviceKey);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await admin.storage.from("receipts").upload(path, bytes, {
    contentType: mime,
    upsert: false,
  });
  if (upErr) {
    return json(
      {
        status: "failed",
        message: `Could not store receipt: ${upErr.message}`,
        version: VERSION,
      },
      500,
    );
  }

  // Ownership invariant: path must start with the authenticated user id.
  if (!path.startsWith(`${user.id}/`)) {
    await admin.storage.from("receipts").remove([path]);
    return json({ error: "Ownership check failed", version: VERSION }, 403);
  }

  const ocr = await runOcr({ bytes, mimeType: mime, fileName: file.name });

  return json({
    ...ocr,
    storagePath: path,
    fileName: file.name,
    mimeType: mime,
    sizeBytes: file.size,
    userId: user.id,
    version: ocr.version || VERSION,
  });
});
