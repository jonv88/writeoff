/**
 * Sandbox bank ingestion. These rows are sample provider data, not a connected bank.
 * Production linking stays unavailable until a real provider returns the customer's own accounts.
 */

export type SandboxKind = 'purchase' | 'refund' | 'transfer' | 'payment';

export type SandboxTransaction = {
  providerId: string;
  accountId: string;
  ownerId: string;
  name: string;
  /** Positive numbers are money out. Refunds use a positive amount with kind refund. */
  amountCents: number;
  currency: string;
  date: string;
  pending: boolean;
  /** Posted id that replaces this pending provider id. */
  settlesTo?: string | null;
  refundOf?: string | null;
  kind: SandboxKind;
};

export type SandboxExpense = {
  id: string;
  ownerId: string;
  providerId: string;
  merchant: string;
  amountCents: number;
  currency: string;
  date: string;
  pending: boolean;
  source: 'Sandbox sample';
  accountLabel: 'Sandbox sample · not your bank';
  reviewed: boolean;
  useType: 'Business' | 'Personal' | 'Split' | 'Unsorted';
  share: number;
  eligiblePercent: number;
  eligibilityChecked: boolean;
};

export type IngestResult = {
  expenses: SandboxExpense[];
  ignored: { providerId: string; reason: string }[];
};

const ACCOUNT_LABEL = 'Sandbox sample · not your bank' as const;

function expenseFrom(tx: SandboxTransaction, previous?: SandboxExpense): SandboxExpense {
  return {
    id: previous?.id || `sandbox-${tx.providerId}`,
    ownerId: tx.ownerId,
    providerId: tx.providerId,
    merchant: tx.name,
    amountCents: tx.amountCents,
    currency: tx.currency || 'USD',
    date: tx.date,
    pending: tx.pending,
    source: 'Sandbox sample',
    accountLabel: ACCOUNT_LABEL,
    reviewed: previous?.reviewed || false,
    useType: previous?.useType || 'Unsorted',
    share: previous?.share || 0,
    eligiblePercent: previous?.eligiblePercent || 0,
    eligibilityChecked: previous?.eligibilityChecked || false,
  };
}

export function ingestSandbox(
  existing: SandboxExpense[],
  incoming: SandboxTransaction[],
  ownerId: string,
): IngestResult {
  const expenses = existing.filter((item) => item.ownerId === ownerId).map((item) => ({ ...item }));
  const ignored: IngestResult['ignored'] = [];
  const byProvider = new Map(expenses.map((item) => [item.providerId, item]));

  for (const tx of incoming) {
    if (tx.ownerId !== ownerId) {
      ignored.push({ providerId: tx.providerId, reason: 'other-customer' });
      continue;
    }
    if (tx.kind === 'transfer' || tx.kind === 'payment') {
      ignored.push({ providerId: tx.providerId, reason: tx.kind });
      continue;
    }
    if (tx.kind === 'refund') {
      const targetId = tx.refundOf;
      if (targetId && byProvider.has(targetId)) {
        const target = byProvider.get(targetId)!;
        const index = expenses.findIndex((item) => item.providerId === targetId);
        if (index >= 0) expenses.splice(index, 1);
        byProvider.delete(targetId);
        ignored.push({ providerId: tx.providerId, reason: `refund-removed:${target.providerId}` });
      } else {
        ignored.push({ providerId: tx.providerId, reason: 'refund-not-spend' });
      }
      continue;
    }
    if (tx.settlesTo) {
      const pending = byProvider.get(tx.providerId);
      if (pending) {
        const posted = expenseFrom({ ...tx, providerId: tx.settlesTo, pending: false, settlesTo: null }, pending);
        const index = expenses.findIndex((item) => item.providerId === tx.providerId);
        expenses.splice(index, 1, posted);
        byProvider.delete(tx.providerId);
        byProvider.set(posted.providerId, posted);
      }
      continue;
    }
    if (byProvider.has(tx.providerId)) {
      ignored.push({ providerId: tx.providerId, reason: 'duplicate' });
      continue;
    }
    const created = expenseFrom(tx);
    expenses.push(created);
    byProvider.set(created.providerId, created);
  }

  return { expenses, ignored };
}
