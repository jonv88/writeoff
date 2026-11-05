/**
 * Short private notes for a rejected or split-line amount.
 * This file never reads or writes the attempt counter.
 */
import { get, put } from '@vercel/blob';

const PATH = 'veryfi-field-diagnostics.json';
const MAX_ENTRIES = 8;
const MAX_AGE_MS = 48 * 60 * 60 * 1000;

export type FieldDiagnostic = {
  requestId: string;
  at: string;
  field: 'total';
  decision: 'accepted' | 'rejected';
  reason: string;
  candidates: number[];
  evidence: string[];
};

function redact(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted]')
    .replace(/\b(?:\d[ -]?){13,19}\b/g, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

export function sanitizeDiagnostic(entry: FieldDiagnostic): FieldDiagnostic {
  return {
    requestId: entry.requestId.replace(/[^A-Za-z0-9._:-]/g, '').slice(0, 80),
    at: entry.at,
    field: 'total',
    decision: entry.decision === 'accepted' ? 'accepted' : 'rejected',
    reason: redact(entry.reason),
    candidates: entry.candidates.filter((value) => Number.isFinite(value)).slice(0, 8),
    evidence: entry.evidence.map(redact).filter(Boolean).slice(0, 8),
  };
}

export function shouldRetainTotalTrace(reason: string): boolean {
  return reason.startsWith('rejected') || reason.includes('next-line') || reason.includes('previous-line') || reason.includes('layout');
}

export function mergeDiagnosticLog(existing: FieldDiagnostic[], entry: FieldDiagnostic, now: number): FieldDiagnostic[] {
  const fresh = existing.filter((item) => {
    const at = Date.parse(item.at);
    return Number.isFinite(at) && now - at <= MAX_AGE_MS;
  });
  fresh.push(sanitizeDiagnostic(entry));
  return fresh.slice(-MAX_ENTRIES);
}

/** Best-effort private note. Failures stay here and do not change the scan budget. */
export async function persistFieldDiagnostic(token: string, entry: FieldDiagnostic): Promise<void> {
  if (!token) return;
  let existing: FieldDiagnostic[] = [];
  try {
    const result = await get(PATH, { access: 'private', token, useCache: false });
    if (result && result.statusCode === 200 && result.stream) {
      const parsed = JSON.parse(await new Response(result.stream).text()) as { entries?: FieldDiagnostic[] };
      if (Array.isArray(parsed.entries)) existing = parsed.entries;
    }
  } catch {
    existing = [];
  }
  const entries = mergeDiagnosticLog(existing, entry, Date.now());
  await put(PATH, JSON.stringify({ entries }), {
    access: 'private',
    token,
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 0,
  });
}
