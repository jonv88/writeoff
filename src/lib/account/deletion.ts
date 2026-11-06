/**
 * Account deletion is separate from canceling a subscription.
 * Records stay until every owned delete step confirms.
 */

export const DELETION_STEPS = [
  'disconnect_providers',
  'delete_receipts',
  'delete_expenses',
  'delete_rules',
  'delete_bank_items',
  'delete_entitlements',
  'delete_profile',
  'revoke_sessions',
  'delete_identity',
] as const;

export type DeletionStep = (typeof DELETION_STEPS)[number];

export const DELETION_RETENTION =
  'Deleting the account removes receipt photos, expense records, and the sign-in. A subscription cancellation does not remove them. Local preview data stays in this browser until you reset it here.';

export function subscriptionCancelKeepsRecords(): true {
  return true;
}

export type AccountStore = {
  disconnectProviders(ownerId: string): Promise<void>;
  deleteOwned(step: Exclude<DeletionStep, 'disconnect_providers'>, ownerId: string): Promise<void>;
};

export async function deleteOwnedAccount(store: AccountStore, ownerId: string): Promise<DeletionStep[]> {
  if (!ownerId) throw new Error('Account deletion needs the signed-in customer.');
  const done: DeletionStep[] = [];
  for (const step of DELETION_STEPS) {
    if (step === 'disconnect_providers') await store.disconnectProviders(ownerId);
    else await store.deleteOwned(step, ownerId);
    done.push(step);
  }
  return done;
}
