/**
 * Evidence-gated receipt totals. No network, no credentials.
 * Labeled amounts only — savings, tips, cash tendered, and change are not the total.
 */

export function reconcileReceiptOcrText(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => {
      let next = line;
      next = next.replace(/\bamount\s*pa[ilt]d\b/gi, 'AMOUNT paid');
      next = next.replace(/\bam+ou?nt\s*pa[ilt]d\b/gi, 'amount paid');
      next = next.replace(/\bbal+a?nce\s*due\b/gi, 'balance due');
      next = next.replace(/\bba[\s-]*l[\s-]*a?n[\s-]*c[\s-]*e\b/gi, 'balance');
      next = next.replace(/\bgran[d0]\s*tot(?:al|ai|a1)\b/gi, 'grand total');
      next = next.replace(/\bfinal\s*tot(?:al|ai|a1)\b/gi, 'final total');
      next = next.replace(/\btot(?:al|ai|a1)\s*due\b/gi, 'total due');
      next = next.replace(/\bt0tal\b/gi, 'total');
      next = next.replace(/\btotai\b/gi, 'total');
      next = next.replace(/\btota1\b/gi, 'total');
      return next;
    })
    .join('\n');
}

const FINAL_LABELS: { name: string; re: RegExp; priority: number }[] = [
  { name: 'amount-paid', re: /\bamount\s*paid\b/i, priority: 100 },
  { name: 'balance-due', re: /\bbalance\s*due\b/i, priority: 95 },
  { name: 'amount-due', re: /\bamount\s*due\b/i, priority: 90 },
  { name: 'grand-total', re: /\bgrand\s*total\b/i, priority: 85 },
  { name: 'final-total', re: /\bfinal\s*total\b/i, priority: 85 },
  { name: 'total-due', re: /\btotal\s*due\b/i, priority: 85 },
  { name: 'total', re: /\btotal\b(?!\s*(?:tax|items?|qty|quantity|savings?))/i, priority: 70 },
  { name: 'balance', re: /\bbalance\b(?!\s*(?:forward|bf|brought))/i, priority: 65 },
];

const NOISE_AMOUNT =
  /\b(?:cash\s*tendered|amount\s*tendered|cash\s*back|cashback|change\s*due|change|rounding|sub\s*total|subtotal|tax|tip|gratuity|you\s*saved|savings?|discount|coupon|rewards?\s*balance|points?\s*balance)\b[^0-9\n]{0,20}\$?\s*\d{1,6}[.,]\d{2}/gi;

const MONEY_ON_LINE = /(?:USD\s*)?\$?\s*(\d{1,6}(?:[.,]\d{2}))\b/gi;

export type TotalRelation = 'same-line' | 'next-line' | 'previous-line';

export type StructuredTotals = {
  total?: number | null;
  subtotal?: number | null;
  tax?: number | null;
  tip?: number | null;
  discount?: number | null;
  cashback?: number | null;
  rounding?: number | null;
};

export type TotalTrace = {
  decision: 'accepted' | 'rejected';
  reason: string;
  candidates: number[];
  evidence: string[];
};

type Hit = {
  value: number;
  priority: number;
  label: string;
  relation: TotalRelation;
};

type Collected = {
  hits: Hit[];
  evidence: string[];
  candidates: number[];
};

function moneyValuesOnLine(line: string): number[] {
  const out: number[] = [];
  MONEY_ON_LINE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MONEY_ON_LINE.exec(line))) {
    const amount = Number(match[1].replace(',', '.'));
    if (Number.isFinite(amount) && amount > 0) out.push(amount);
  }
  return out;
}

function cents(value: number): number {
  return Math.round(value * 100);
}

function sameMoney(a: number, b: number): boolean {
  return cents(a) === cents(b);
}

/** Drop non-final amounts so a total printed beside change or tax can still be read. */
function stripNoiseAmounts(line: string): string {
  return line.replace(new RegExp(NOISE_AMOUNT.source, 'gi'), ' ');
}

function isRewards(line: string): boolean {
  return /\brewards?\s*balance\b|\bpoints?\s*balance\b|\bmembership\s*balance\b|\breward\s*points\b/i.test(line);
}

function nonFinalName(line: string): string | null {
  if (isRewards(line)) return 'rewards';
  if (/\bsub\s*total\b|\bsubtotal\b/i.test(line)) return 'subtotal';
  if (/\b(?:sales\s*)?tax\b|\btotal\s*tax\b|\btax\s*total\b/i.test(line)) return 'tax';
  if (/\btip\b|\bgratuity\b/i.test(line)) return 'tip';
  if (/\bdiscount\b|\bcoupon\b/i.test(line)) return 'discount';
  if (/\byou\s*saved\b|\bsavings?\b/i.test(line)) return 'savings';
  if (/\bchange\b/i.test(line)) return 'change';
  if (/\bcash\s*tendered\b|\bamount\s*tendered\b|\bcash\s*back\b|\bcashback\b/i.test(line)) return 'cash-tendered';
  if (/\brounding\b/i.test(line)) return 'rounding';
  if (/\bdeposit\b|\brefund\b|\bcredit\s*applied\b|\bitems?\s*total\b|\bqty\b|\bquantity\b/i.test(line)) {
    return 'other-non-final';
  }
  if (/\bcash\b/i.test(line)) return 'cash';
  return null;
}

function matchFinal(line: string): { name: string; priority: number } | null {
  if (isRewards(line)) return null;
  const stripped = stripNoiseAmounts(line);
  for (const label of FINAL_LABELS) {
    if (label.re.test(stripped)) return { name: label.name, priority: label.priority };
  }
  return null;
}

type Classified = {
  finalLabel: { name: string; priority: number } | null;
  nonFinal: string | null;
  values: number[];
};

function classifyLine(line: string): Classified {
  const finalLabel = matchFinal(line);
  const values = moneyValuesOnLine(finalLabel ? stripNoiseAmounts(line) : line);
  return {
    finalLabel,
    nonFinal: finalLabel ? null : nonFinalName(line),
    values,
  };
}

function moneyOnly(line: Classified): number | null {
  if (line.finalLabel || line.nonFinal || line.values.length !== 1) return null;
  return line.values[0];
}

/** An amount directly under a non-final label belongs to that label. */
function adjacentMoney(lines: Classified[], index: number, direction: 1 | -1): number | null {
  const other = index + direction;
  if (other < 0 || other >= lines.length) return null;
  if (direction === -1 && other > 0 && lines[other - 1].nonFinal && lines[other - 1].values.length === 0) {
    return null;
  }
  return moneyOnly(lines[other]);
}

function pushUnique(values: number[], value: number) {
  if (!values.some((item) => sameMoney(item, value))) values.push(value);
}

function collectHits(text: string, structured?: StructuredTotals): Collected {
  const lines = reconcileReceiptOcrText(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(classifyLine);
  const hits: Hit[] = [];
  const evidence: string[] = [];
  const candidates: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.nonFinal && line.values.length) {
      const value = line.values[line.values.length - 1];
      pushUnique(candidates, value);
      evidence.push(`${line.nonFinal}:same-line:${value}`);
      continue;
    }
    if (!line.finalLabel) continue;
    let value: number | null = null;
    let relation: TotalRelation = 'same-line';
    if (line.values.length) {
      value = line.values[line.values.length - 1];
    } else {
      const next = adjacentMoney(lines, i, 1);
      const prev = adjacentMoney(lines, i, -1);
      if (next != null && prev != null && !sameMoney(next, prev)) {
        const structuredTotal = structured?.total;
        if (structuredTotal != null && sameMoney(structuredTotal, prev)) {
          value = prev;
          relation = 'previous-line';
        } else {
          value = next;
          relation = 'next-line';
        }
      } else if (next != null) {
        value = next;
        relation = 'next-line';
      } else if (prev != null) {
        value = prev;
        relation = 'previous-line';
      }
    }
    if (value == null) continue;
    pushUnique(candidates, value);
    evidence.push(`${line.finalLabel.name}:${relation}:${value}`);
    hits.push({ value, priority: line.finalLabel.priority, label: line.finalLabel.name, relation });
  }

  if (structured) {
    for (const [name, value] of Object.entries(structured)) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) continue;
      pushUnique(candidates, value);
      evidence.push(`structured-${name}:${value}`);
    }
  }
  return { hits, evidence: evidence.slice(0, 8), candidates: candidates.slice(0, 8) };
}

function decideHits(collected: Collected): TotalTrace & { total: number | null; relation: TotalRelation | null } {
  const { hits, evidence, candidates } = collected;
  if (!hits.length) {
    const structuredOnly = evidence.some((item) => item.startsWith('structured-total:')) &&
      !evidence.some((item) => /^(?:amount-paid|balance-due|amount-due|grand-total|final-total|total-due|total|balance):/.test(item));
    return {
      total: null,
      relation: null,
      decision: 'rejected',
      reason: structuredOnly ? 'rejected-structured-only' : 'rejected-no-label',
      candidates,
      evidence,
    };
  }
  const ordered = [...hits].sort((a, b) => b.priority - a.priority);
  const topPriority = ordered[0].priority;
  const top = ordered.filter((hit) => hit.priority === topPriority);
  const topValues = [...new Set(top.map((hit) => cents(hit.value)))];
  const finalValues = [...new Set(ordered.filter((hit) => hit.priority >= 65).map((hit) => cents(hit.value)))];
  if (topValues.length !== 1 || (finalValues.length > 1 && topPriority < 95)) {
    return {
      total: null,
      relation: null,
      decision: 'rejected',
      reason: 'rejected-conflict',
      candidates,
      evidence,
    };
  }
  const winner = top[top.length - 1];
  const reason =
    winner.relation === 'same-line' ? 'accepted-same-line' : `accepted-${winner.relation}`;
  return {
    total: winner.value,
    relation: winner.relation,
    decision: 'accepted',
    reason,
    candidates,
    evidence,
  };
}

/** Group provider line boxes into reading rows. Tops may be pixels or 0–1 fractions. */
export function rowsFromLayout(lines: { text: string; top: number; left?: number }[]): string[] {
  const sorted = lines
    .filter((line) => line.text.trim())
    .sort((a, b) => a.top - b.top || (a.left ?? 0) - (b.left ?? 0));
  const rows: { top: number; parts: { left: number; text: string }[] }[] = [];
  for (const line of sorted) {
    const threshold = Math.abs(line.top) > 2 ? 14 : 0.015;
    const last = rows[rows.length - 1];
    if (!last || Math.abs(line.top - last.top) > threshold) {
      rows.push({ top: line.top, parts: [{ left: line.left ?? 0, text: line.text.trim() }] });
    } else {
      last.parts.push({ left: line.left ?? 0, text: line.text.trim() });
    }
  }
  return rows.map((row) => row.parts.sort((a, b) => a.left - b.left).map((part) => part.text).join(' '));
}

/**
 * Final purchase amount from labels on the same line or the next/previous line.
 * Subtotal, tax, savings, rewards, cash tendered, and change stay out.
 * A structured total can choose between two adjacent amounts. It cannot override a conflict.
 */
export function explainTotal(
  text: string,
  extra?: { layoutText?: string; structured?: StructuredTotals },
): TotalTrace & { total: number | null; currency: string } {
  const fromText = decideHits(collectHits(text, extra?.structured));
  const fromLayout = extra?.layoutText?.trim()
    ? decideHits(collectHits(extra.layoutText, extra.structured))
    : null;
  if (fromText.reason === 'rejected-conflict') {
    return {
      total: null,
      currency: 'USD',
      decision: 'rejected',
      reason: 'rejected-conflict',
      candidates: fromText.candidates,
      evidence: fromText.evidence,
    };
  }
  if (fromLayout?.total != null && fromText.total != null && !sameMoney(fromLayout.total, fromText.total)) {
    return {
      total: null,
      currency: 'USD',
      decision: 'rejected',
      reason: 'rejected-conflict',
      candidates: [...fromText.candidates, ...fromLayout.candidates].slice(0, 8),
      evidence: [...fromText.evidence, ...fromLayout.evidence.map((item) => `layout:${item}`)].slice(0, 8),
    };
  }
  const chosen = fromText.total != null ? fromText : fromLayout?.total != null ? fromLayout : fromText;
  const reason = chosen === fromLayout && chosen.total != null ? 'accepted-layout-row' : chosen.reason;
  return {
    total: chosen.total,
    currency: 'USD',
    decision: chosen.decision,
    reason,
    candidates: chosen.candidates,
    evidence: chosen.evidence,
  };
}

export function parseTotalFromText(text: string): { total: number | null; currency: string } {
  const explained = explainTotal(text);
  return { total: explained.total, currency: explained.currency };
}
