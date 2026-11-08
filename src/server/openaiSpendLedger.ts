/**
 * In-process copy of the SQL receipt budget. Tests use this.
 * A failed or timed-out attempt keeps its reserved cents.
 */

export type SpendDecision =
  | { ok: true; attemptId: string; reservedCents: number }
  | { ok: false; reason: 'unconfigured' | 'budget' | 'cap' };

export type OpenAiUsageRecord = {
  outcome: 'completed' | 'failed' | 'timeout';
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  imageTokens: number | null;
  measuredCents: number | null;
  latencyMs: number | null;
  httpStatus: number | null;
  byteLength: number | null;
};

export type LedgerRow = Omit<OpenAiUsageRecord, 'outcome'> & {
  id: string;
  ownerId: string;
  month: string;
  reservedCents: number;
  outcome: 'reserved' | OpenAiUsageRecord['outcome'];
};

export function createOpenAiSpendLedger() {
  let chain: Promise<void> = Promise.resolve();
  const rows: LedgerRow[] = [];
  let sequence = 0;

  function enqueue<T>(work: () => T): Promise<T> {
    const run = chain.then(work, work);
    chain = run.then(() => undefined, () => undefined);
    return run;
  }

  return {
    reserve(input: {
      ownerId: string;
      month: string;
      customerCap: number;
      globalCap: number;
      budgetCents: number | null;
      reserveCents: number;
    }): Promise<SpendDecision> {
      return enqueue(() => {
        if (input.customerCap < 1 || input.customerCap > 20 || input.globalCap < 1 || input.globalCap > 60) {
          return { ok: false, reason: 'cap' };
        }
        if (input.budgetCents == null) return { ok: false, reason: 'unconfigured' };
        if (!Number.isInteger(input.budgetCents) || input.reserveCents < 1 || input.budgetCents < input.reserveCents) {
          return { ok: false, reason: 'budget' };
        }
        const monthRows = rows.filter((row) => row.month === input.month);
        const mine = monthRows.filter((row) => row.ownerId === input.ownerId).length;
        const spent = monthRows.reduce((sum, row) => sum + row.reservedCents, 0);
        if (mine >= input.customerCap || monthRows.length >= input.globalCap) {
          return { ok: false, reason: 'cap' };
        }
        if (spent + input.reserveCents > input.budgetCents) return { ok: false, reason: 'budget' };
        const id = `attempt-${++sequence}`;
        rows.push({
          id,
          ownerId: input.ownerId,
          month: input.month,
          reservedCents: input.reserveCents,
          outcome: 'reserved',
          model: null,
          inputTokens: null,
          outputTokens: null,
          imageTokens: null,
          measuredCents: null,
          latencyMs: null,
          httpStatus: null,
          byteLength: null,
        });
        return { ok: true, attemptId: id, reservedCents: input.reserveCents };
      });
    },
    record(id: string, patch: OpenAiUsageRecord): Promise<boolean> {
      return enqueue(() => {
        const row = rows.find((item) => item.id === id);
        if (!row) return false;
        const reserved = row.reservedCents;
        row.outcome = patch.outcome;
        row.model = patch.model;
        row.inputTokens = patch.inputTokens;
        row.outputTokens = patch.outputTokens;
        row.imageTokens = patch.imageTokens;
        row.measuredCents = patch.measuredCents;
        row.latencyMs = patch.latencyMs;
        row.httpStatus = patch.httpStatus;
        row.byteLength = patch.byteLength;
        row.reservedCents = reserved;
        return true;
      });
    },
    rows(): LedgerRow[] {
      return rows.map((row) => ({ ...row }));
    },
  };
}
