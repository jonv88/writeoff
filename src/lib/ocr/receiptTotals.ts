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

const AMOUNT_LABELS: { re: RegExp; priority: number }[] = [
  { re: /\bamount\s*paid\b/i, priority: 100 },
  { re: /\bbalance\s*due\b/i, priority: 95 },
  { re: /\bamount\s*due\b/i, priority: 90 },
  { re: /\bgrand\s*total\b/i, priority: 85 },
  { re: /\bfinal\s*total\b/i, priority: 85 },
  { re: /\btotal\s*due\b/i, priority: 85 },
  { re: /\btotal\b(?!\s*(?:tax|items?|qty|quantity|savings?))/i, priority: 70 },
  { re: /\bbalance\b(?!\s*(?:forward|bf|brought))/i, priority: 65 },
];

const NON_TOTAL_LINE =
  /\b(?:sub\s*total|subtotal|tax|tip|gratuity|discount|coupon|you\s*saved|savings?|change|cash\s*back|cash\s*tendered|amount\s*tendered|deposit|refund|credit\s*applied|items?\s*total|qty|quantity)\b/i;

const MONEY_ON_LINE = /(?:USD\s*)?\$?\s*(\d{1,6}(?:[.,]\d{2}))\b/gi;

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

/** Drop cash-tendered and change amounts so they cannot win over the purchase total. */
function stripTenderNoise(line: string): string {
  return line
    .replace(/\b(?:cash\s*tendered|amount\s*tendered|change\s*due|change)\b[^0-9\n]{0,16}\$?\s*\d{1,6}[.,]\d{2}/gi, ' ')
    .replace(/\b(?:cash\s*tendered|amount\s*tendered)\b/gi, ' ');
}

export function parseTotalFromText(text: string): { total: number | null; currency: string } {
  const lines = reconcileReceiptOcrText(text)
    .split(/\r?\n/)
    .map((line) => stripTenderNoise(line).trim())
    .filter(Boolean);
  type Hit = { value: number; priority: number; lineIndex: number };
  const hits: Hit[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (NON_TOTAL_LINE.test(line)) continue;
    if (/\bcash\b/i.test(line) && !/\b(total|amount\s*(?:paid|due)|balance)\b/i.test(line)) continue;
    const values = moneyValuesOnLine(line);
    if (!values.length) continue;
    for (const label of AMOUNT_LABELS) {
      if (!label.re.test(line)) continue;
      hits.push({ value: values[values.length - 1], priority: label.priority, lineIndex: i });
      break;
    }
  }

  if (!hits.length) return { total: null, currency: 'USD' };

  hits.sort((a, b) => b.priority - a.priority || b.lineIndex - a.lineIndex);
  const topPriority = hits[0].priority;
  if (topPriority < 65) return { total: null, currency: 'USD' };
  const top = hits.filter((hit) => hit.priority === topPriority);
  const topValues = [...new Set(top.map((hit) => hit.value))];
  if (topValues.length !== 1) return { total: null, currency: 'USD' };

  const finalish = hits.filter((hit) => hit.priority >= 65);
  const finalishValues = [...new Set(finalish.map((hit) => hit.value))];
  if (finalishValues.length > 1 && topPriority < 95) return { total: null, currency: 'USD' };

  return { total: topValues[0], currency: 'USD' };
}
