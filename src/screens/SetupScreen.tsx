import { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import {
  clearLegacyLocalStorage,
  detectLegacyLocalStorage,
} from '../lib/legacyMigration';
import { importExpenses, saveMerchantRule, saveProfile } from '../lib/data';
import { DELETION_RETENTION } from '../lib/account/deletion';
import { APPROVED_PLAN } from '../lib/billing/plan';
import { expensesToCsv } from '../lib/records/csvExport';
import { uid } from '../lib/core';

const sourceLinks = (
  <>
    <a href="https://www.irs.gov/publications/p334" target="_blank" rel="noopener noreferrer">
      Business expenses
    </a>{' '}
    ·{' '}
    <a href="https://www.irs.gov/publications/p502" target="_blank" rel="noopener noreferrer">
      Medical records
    </a>{' '}
    ·{' '}
    <a href="https://www.irs.gov/publications/p526" target="_blank" rel="noopener noreferrer">
      Donations
    </a>
  </>
);

export function SetupScreen({ onSetup }: { onSetup: () => void }) {
  const {
    profile,
    rules,
    records,
    localPreview,
    forgetRule,
    refresh,
    showToast,
    loadSampleData,
    resetToEmpty,
  } = useWorkspace();
  const checkout = typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('checkout');
  const { user, session, signOut } = useAuth();
  const legacy = useMemo(() => detectLegacyLocalStorage(), []);
  const [importing, setImporting] = useState(false);
  const [legacyMsg, setLegacyMsg] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function importLegacy() {
    if (!user || !legacy.preview) return;
    setImporting(true);
    setLegacyMsg(null);
    try {
      const existingIds = new Set(records.map((r) => r.id));
      const fresh = legacy.preview.records
        .filter((r) => !existingIds.has(r.id))
        .map((r) => ({ ...r, id: existingIds.has(r.id) ? uid() : r.id, receipt: null }));
      // Also skip fingerprint collisions
      const fps = new Set(
        records.map((r) => `${r.date}|${r.merchant.toLowerCase()}|${r.amount.toFixed(2)}`),
      );
      const unique = fresh.filter(
        (r) => !fps.has(`${r.date}|${r.merchant.toLowerCase()}|${r.amount.toFixed(2)}`),
      );

      if (legacy.preview.profile.complete) {
        await saveProfile(user.id, { ...legacy.preview.profile, complete: true });
      }
      for (const rule of legacy.preview.rules) {
        await saveMerchantRule(user.id, rule);
      }
      const n = unique.length ? await importExpenses(user.id, unique) : 0;
      await refresh();
      clearLegacyLocalStorage();
      setLegacyMsg(
        `Imported ${n} expenses${legacy.preview.profile.complete ? ', workspace setup' : ''}${
          legacy.preview.rules.length ? `, ${legacy.preview.rules.length} preferences` : ''
        }. Browser copies cleared after server confirmation. Receipt files were not auto-uploaded — re-attach them as needed.`,
      );
      showToast('Browser records imported into your account.');
    } catch (err) {
      setLegacyMsg(
        err instanceof Error
          ? err.message
          : 'Import failed. Your browser copy was left unchanged.',
      );
    } finally {
      setImporting(false);
    }
  }

  async function deleteAccount() {
    if (!user) return;
    const confirmed = window.confirm(
      'Delete this account, its records, and its sign-in? This does not cancel a subscription. The login stops working after the server confirms.',
    );
    if (!confirmed) return;
    setDeleting(true);
    try {
      if (!session?.access_token) throw new Error('Sign in again before deleting this account.');
      const response = await fetch('/api/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: 'delete' }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error || 'Account deletion did not finish.');
      await signOut().catch(() => undefined);
      showToast('Account deleted.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Account deletion did not finish.');
    } finally {
      setDeleting(false);
    }
  }

  async function exportAllCsv() {
    const blob = new Blob([expensesToCsv(records)], {
      type: 'text/csv;charset=utf-8',
    });
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u;
    a.download = 'writeoff-expenses.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
    showToast(`${records.length} expense records exported.`);
  }

  return (
    <div className="twocol">
      <div className="stack">
        <div className="panel">
          <div className="panelhead">
            <h2>Your workspace</h2>
            <button type="button" className="btn secondary" onClick={onSetup}>
              Edit setup
            </button>
          </div>
          <div className="rule">
            <span>Tracking</span>
            <b>{profile.mode}</b>
          </div>
          <div className="rule">
            <span>Workspace</span>
            <b>{profile.name || 'Your workspace'}</b>
          </div>
          <div className="rule">
            <span>Tax country</span>
            <b>
              {profile.country === 'US' ? 'United States' : 'Outside U.S. · local review only'}
            </b>
          </div>
          <p className="helper" style={{ marginTop: 15 }}>
            Changing setup updates suggestions for unreviewed items. Your confirmed decisions stay
            in place.
          </p>
        </div>
        <div className="panel">
          <h2>Remembered merchant preferences</h2>
          <p className="helper" style={{ marginTop: 9 }}>
            Preferences suggest future use. New expenses still need a quick review.
          </p>
          {rules.length ? (
            rules.map((r) => (
              <div className="rule" key={r.id || r.merchant}>
                <div>
                  <b>{r.merchant}</b>
                  <div className="ruleline">
                    {r.type}
                    {r.type === 'Split' ? ` · ${r.share}% business` : ''} · {r.category}
                  </div>
                </div>
                {r.id && (
                  <button type="button" className="edit" onClick={() => void forgetRule(r.id!)}>
                    Forget
                  </button>
                )}
              </div>
            ))
          ) : (
            <p className="helper" style={{ marginTop: 20 }}>
              No preferences yet. Save one while reviewing a merchant.
            </p>
          )}
        </div>
      </div>
      <div className="stack">
        <div className="panel">
          <h2>Your records, backed up.</h2>
          <p className="helper" style={{ margin: '13px 0' }}>
            {localPreview
              ? 'Export a CSV of expenses stored in this browser. Local preview does not sync across devices or to the cloud.'
              : 'Export a CSV of your cloud records. Full backup-with-receipts download expands in a later phase.'}
          </p>
          <div className="inlinebuttons">
            <button type="button" className="btn secondary" onClick={() => void exportAllCsv()}>
              Export all CSV
            </button>
            {!localPreview && user && (
              <button type="button" className="btn secondary" onClick={() => void signOut()}>
                Sign out
              </button>
            )}
          </div>
          <p className="helper" style={{ marginTop: 12 }}>
            {DELETION_RETENTION}
          </p>
          {!localPreview && user && (
            <button
              type="button"
              className="btn secondary"
              disabled={deleting}
              onClick={() => void deleteAccount()}
              style={{ marginTop: 12 }}
            >
              {deleting ? 'Deleting…' : 'Delete account'}
            </button>
          )}
        </div>

        <div className="panel">
          <h2>Subscription</h2>
          <p className="helper" style={{ margin: '12px 0' }}>
            Writeoff Plus is {APPROVED_PLAN.label}. Annual billing is not offered.
            Purchases are not turned on in this preview, and a subscription starts only after the
            payment provider confirms it. Canceling a subscription does not delete your records or
            turn off export. Cloud receipt reading is limited; it is not unlimited.
          </p>
          {checkout === 'return' && (
            <p className="helper">Checkout returned to Writeoff. Access changes only after the payment provider confirms the event.</p>
          )}
          {checkout === 'cancel' && (
            <p className="helper">Checkout was canceled. No payment was recorded.</p>
          )}
          <span className="badge statuspending">No subscription</span>
        </div>

        {localPreview && (
          <div className="panel">
            <h2>Local preview controls</h2>
            <p className="helper" style={{ margin: '12px 0' }}>
              Sample data is clearly labeled synthetic (Demo Studio). Reset clears this browser’s
              preview workspace. Data does <strong>not sync across devices</strong>. Cloud accounts,
              bank linking, and purchases stay unavailable.
            </p>
            <div className="inlinebuttons">
              <button type="button" className="btn" onClick={loadSampleData}>
                Load sample expenses
              </button>
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  if (
                    window.confirm(
                      'Clear all local preview expenses, setup, and preferences in this browser?',
                    )
                  ) {
                    resetToEmpty();
                  }
                }}
              >
                Reset to empty
              </button>
            </div>
            <div className="notice" style={{ marginTop: 14 }}>
              Receipt OCR uses free on-device Tesseract.js in this browser (no API keys). Fields stay
              editable; accuracy varies. Prefer JPEG/PNG — HEIC/PDF are limited. Not a fake OCR
              demo.
            </div>
          </div>
        )}

        {(legacy.present || legacy.error) && !localPreview && (
          <div className="panel">
            <h2>Browser records found</h2>
            <p className="helper" style={{ margin: '12px 0' }}>
              This device still has prototype data (
              {legacy.source || 'unknown key'}
              {legacy.recordCount ? ` · ${legacy.recordCount} expenses` : ''}). Import is explicit —
              nothing uploads on sign-in alone. Receipt data URLs are not auto-uploaded.
            </p>
            {legacy.error && <div className="formerror">{legacy.error}</div>}
            {legacy.preview && (
              <button
                type="button"
                className="btn"
                disabled={importing}
                onClick={() => void importLegacy()}
              >
                {importing ? 'Importing…' : 'Preview & import into this account'}
              </button>
            )}
            {legacyMsg && (
              <div className="notice" style={{ marginTop: 14 }}>
                {legacyMsg}
              </div>
            )}
          </div>
        )}

        <div className="panel">
          <h2>How suggestions work</h2>
          <p className="helper" style={{ margin: '12px 0' }}>
            Simple merchant and category rules use your setup to suggest what to review. They don’t
            read receipts, calculate taxes, or establish eligibility. Employee expenses, meals,
            equipment and mixed use may need extra review.
          </p>
          <p className="helper">
            U.S. guidance checked November 2, 2026. Rules and tax-year conditions may change.{' '}
            {sourceLinks}
          </p>
        </div>
      </div>
    </div>
  );
}
