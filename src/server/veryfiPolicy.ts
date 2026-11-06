import { APPROVED_PLAN } from '../lib/billing/plan.ts';

/** Cloud receipt assists per paying customer per month. Not unlimited. */
export const CLOUD_SCANS_PER_CUSTOMER_MONTH = 8;

/**
 * Global billable attempts per month while no paid Veryfi plan is accepted.
 * A positive budget has to be set deliberately before any document is sent.
 */
export const GLOBAL_CLOUD_SCANS_PER_MONTH_DEFAULT = 0;

/** One HTTP request per reserved attempt. A retry is another billable attempt. */
export const MAX_NETWORK_ATTEMPTS = 1;

export const CUSTOMER_REQUESTS_PER_MINUTE = 6;

export function providerEnabled(env: { VERYFI_PROVIDER?: string; VERYFI_LIVE_CALLS?: string; VERCEL_ENV?: string }): boolean {
  return env.VERCEL_ENV !== 'production' && env.VERYFI_PROVIDER === 'enabled' && env.VERYFI_LIVE_CALLS === '1';
}

export function globalScanBudget(env: { VERYFI_GLOBAL_MONTHLY_CAP?: string }): number {
  const parsed = Number(env.VERYFI_GLOBAL_MONTHLY_CAP ?? GLOBAL_CLOUD_SCANS_PER_MONTH_DEFAULT);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

export function cloudScanRefusal(entitled: boolean): string {
  if (!entitled) return `Cloud receipt reading is included with Writeoff Plus at ${APPROVED_PLAN.label}.`;
  return 'This month’s cloud receipt reading allowance is used. Review the photo on this device.';
}

export function createRateLimiter(limit = CUSTOMER_REQUESTS_PER_MINUTE, windowMs = 60_000) {
  const hits = new Map<string, number[]>();
  return (key: string, now = Date.now()): boolean => {
    const recent = (hits.get(key) || []).filter((at) => now - at < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    return true;
  };
}

export function createScanLedger() {
  let chain: Promise<void> = Promise.resolve();
  const rows: { ownerId: string; month: string }[] = [];
  return {
    reserve(ownerId: string, month: string, customerCap: number, globalCap: number): Promise<boolean> {
      const run = chain.then(() => {
        if (customerCap < 1 || globalCap < 1) return false;
        const mine = rows.filter((row) => row.ownerId === ownerId && row.month === month).length;
        const total = rows.filter((row) => row.month === month).length;
        if (mine >= customerCap || total >= globalCap) return false;
        rows.push({ ownerId, month });
        return true;
      });
      chain = run.then(() => undefined, () => undefined);
      return run;
    },
    count(ownerId: string, month: string): number {
      return rows.filter((row) => row.ownerId === ownerId && row.month === month).length;
    },
  };
}
