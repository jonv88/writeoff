import { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import {
  clearLegacyLocalStorage,
  detectLegacyLocalStorage,
} from '../lib/legacyMigration';
import { importExpenses, saveMerchantRule, saveProfile } from '../lib/data';
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
  const { user, signOut } = useAuth();
  const legacy = useMemo(() => detectLegacyLocalStorage(), []);
  const [importing, setImporting] = useState(false);
  const [legacyMsg, setLegacyMsg] = useState<string | null>(null);

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

  async function exportAllCsv() {
    const rows = [
      ['Merchant', 'Date', 'Category', 'Use', 'Amount (USD)', 'Notes', 'Source'],
      ...records.map((r) => [
        r.merchant,
        r.date,
        r.category,
        r.type,
        String(r.amount),
        r.notes,
        r.source,
      ]),
    ];
    const cell = (v: string) => `"${String(v ?? '').replace(/^[\s]*[=+@-]/, "'$&").replace(/"/g, '""')}"`;
    const blob = new Blob(['\uFEFF' + rows.map((row) => row.map(cell).join(',')).join('\r\n')], {
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
              ? 'Export a CSV of the expenses stored in this browser. Local preview is not cloud sync.'
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
        </div>

        {localPreview && (
          <div className="panel">
            <h2>Local preview controls</h2>
            <p className="helper" style={{ margin: '12px 0' }}>
              Sample data is clearly labeled synthetic (Demo Studio). Reset clears this device’s
              preview workspace. Cloud auth, OCR extraction, banks, and purchases stay unavailable
              here.
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
                      'Clear all local preview expenses, setup, and preferences on this device?',
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
              Automatic receipt OCR is not available in local preview — attach a file and enter
              details manually. This is not a simulated OCR success.
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
