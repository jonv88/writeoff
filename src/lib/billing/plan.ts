/** Approved Writeoff subscription. Annual billing is not approved. */
export const APPROVED_PLAN = {
  amountCents: 999,
  currency: 'USD',
  interval: 'month',
  annualApproved: false,
  label: '$9.99 per month',
} as const;

export function isApprovedPlan(plan: { amountCents: number; currency: string; interval: string }): boolean {
  return plan.amountCents === APPROVED_PLAN.amountCents
    && plan.currency === APPROVED_PLAN.currency
    && plan.interval === APPROVED_PLAN.interval
    && APPROVED_PLAN.annualApproved === false;
}
