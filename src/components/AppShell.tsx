import { useCallback, useState } from 'react';
import type { ViewName } from '../lib/types';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { getReceiptSignedUrl } from '../lib/data';
import { disableLocalPreview } from '../lib/localWorkspace';
import { ReviewScreen } from '../screens/ReviewScreen';
import { ExpensesScreen } from '../screens/ExpensesScreen';
import { ReceiptsScreen } from '../screens/ReceiptsScreen';
import { AccountsScreen } from '../screens/AccountsScreen';
import { SetupScreen } from '../screens/SetupScreen';
import { SetupDialog } from './dialogs/SetupDialog';
import { ExpenseDialog } from './dialogs/ExpenseDialog';
import { DecisionDialog } from './dialogs/DecisionDialog';
import { ImportDialog } from './dialogs/ImportDialog';
import { SnapReceiptDialog } from './dialogs/SnapReceiptDialog';
import { Toast } from './Toast';

const titles: Record<ViewName, [string, string]> = {
  Review: [
    'A few taps. All caught up.',
    'Spot possible write-offs. Keep personal and business spending in order.',
  ],
  Expenses: ['Every expense has a place.', 'Your records, ready when you need them.'],
  Receipts: [
    'Your paper trail, together.',
    'Attach a receipt to an existing expense to keep everything in one place.',
  ],
  Accounts: ['Less typing starts here.', 'Bring your spending into one clear picture.'],
  Settings: ['Make it work for you.', 'A few preferences. A little less admin.'],
};

export function AppShell() {
  const { user, signOut } = useAuth();
  const { profile, records, loading, error, localPreview, saveRecord, removeRecord, showToast } =
    useWorkspace();
  const [view, setView] = useState<ViewName>('Review');
  const [setupOpen, setSetupOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [expenseId, setExpenseId] = useState<string | null>(null);
  const [decisionOpen, setDecisionOpen] = useState(false);
  const [decisionId, setDecisionId] = useState<string | null>(null);
  const [decisionUse, setDecisionUse] = useState<'Business' | 'Split' | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [snapOpen, setSnapOpen] = useState(false);
  const [snapFile, setSnapFile] = useState<File | null>(null);
  const [findMissing, setFindMissing] = useState(false);

  const pending = records.filter((r) => !r.reviewed).length;
  const initials = (user?.email || (localPreview ? 'LP' : 'YO')).slice(0, 2).toUpperCase();

  const openExpense = (id?: string) => {
    setExpenseId(id || null);
    setExpenseOpen(true);
  };

  const viewReceipt = useCallback(
    async (id: string) => {
      const r = records.find((x) => x.id === id);
      if (r?.receipt?.localPreviewUrl) {
        window.open(r.receipt.localPreviewUrl, '_blank', 'noopener,noreferrer');
        return;
      }
      if (!r?.receipt?.storagePath) {
        showToast('No receipt file is available for this expense.');
        return;
      }
      try {
        const url = await getReceiptSignedUrl(r.receipt.storagePath);
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Could not open receipt.');
      }
    },
    [records, showToast],
  );

  const markPersonal = async (id: string) => {
    const r = records.find((x) => x.id === id);
    if (!r) return;
    await saveRecord({
      ...r,
      type: 'Personal',
      share: 0,
      reviewed: true,
      percent: 0,
      eligibilityChecked: false,
      treatmentSource: 'user',
    });
    showToast('Marked personal. No deduction assumed.');
  };

  const exitLocal = () => {
    disableLocalPreview();
    window.dispatchEvent(new Event('writeoff-local-preview'));
    window.location.reload();
  };

  return (
    <>
      <aside>
        <div className="brand">
          <span className="mark">w</span>
          writeoff<span style={{ color: '#a4b984' }}>.</span>
        </div>
        <nav className="nav">
          {(
            [
              ['Review', '◫'],
              ['Expenses', '☷'],
              ['Receipts', '▧'],
              ['Accounts', '▱'],
              ['Settings', '⚙'],
            ] as const
          ).map(([name, glyph]) => (
            <button
              key={name}
              type="button"
              data-view={name}
              className={view === name ? 'active' : undefined}
              onClick={() => setView(name)}
            >
              <span className="navglyph">{glyph}</span>
              <span>{name === 'Settings' ? 'Setup' : name}</span>
              {name === 'Review' && <small id="navcount">{pending}</small>}
            </button>
          ))}
        </nav>
        <div className="asidebottom">
          <strong>Less admin. More living.</strong>
          A few quick decisions now. Organized records when you need them.
          <br />
          <span style={{ color: '#4f7146' }}>
            ✦{' '}
            {localPreview
              ? 'Local preview · this browser only · does not sync across devices'
              : 'Saved to your account'}
          </span>
        </div>
      </aside>
      <main>
        <header>
          <div className="crumb">
            Your workspace <span style={{ margin: '0 10px', color: '#c4cbbd' }}>/</span>{' '}
            <b id="breadcrumb">{view === 'Settings' ? 'Setup' : view}</b>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {localPreview && (
              <button type="button" className="usepill" onClick={exitLocal}>
                Exit local preview
              </button>
            )}
            {!localPreview && user && (
              <button type="button" className="usepill" onClick={() => void signOut()}>
                Sign out
              </button>
            )}
            <button type="button" className="usepill" id="editprofile" onClick={() => setSetupOpen(true)}>
              {profile.complete
                ? `${profile.mode} · ${profile.name || 'Your workspace'}`
                : 'Set up your workspace'}
            </button>
            <div className="avatar">{initials}</div>
          </div>
        </header>
        {localPreview && (
          <div className="notice" style={{ marginTop: 18 }}>
            <strong>Browser-local storage only</strong> — expenses and receipts on this device do{' '}
            <strong>not sync</strong> to your phone, another Mac, or the cloud. Sample data is
            synthetic. Cloud accounts, bank linking, and purchases are unavailable.
          </div>
        )}
        <section className="heading">
          <div>
            <div className="kicker">LESS TO DO. MORE UNDER CONTROL.</div>
            <h1 id="title">{titles[view][0]}</h1>
            <p id="subtitle">{titles[view][1]}</p>
          </div>
          <div className="actions">
            <button type="button" className="btn" onClick={() => setSnapOpen(true)}>
              ⌗ Snap a receipt
            </button>
            <button type="button" className="btn secondary" id="importbtn" onClick={() => setImportOpen(true)}>
              ↓ Import expenses
            </button>
            <button type="button" className="btn secondary" id="add" onClick={() => openExpense()}>
              ＋ Add expense
            </button>
          </div>
        </section>
        <div id="content">
          {loading && <div className="notice">Loading your workspace…</div>}
          {error && (
            <div className="notice">
              Saved records could not be read ({error}). Avoid saving new data until connectivity is
              restored.
            </div>
          )}
          {!loading && !error && view === 'Review' && (
            <ReviewScreen
              onSetup={() => setSetupOpen(true)}
              onAdd={() => openExpense()}
              onImport={() => setImportOpen(true)}
              onSnap={() => setSnapOpen(true)}
              onEdit={(id) => openExpense(id)}
              onDecide={(id, use) => {
                setDecisionId(id);
                setDecisionUse(use);
                setDecisionOpen(true);
              }}
              onPersonal={(id) => void markPersonal(id)}
              onExclude={(id) => void removeRecord(id)}
            />
          )}
          {!loading && !error && view === 'Expenses' && (
            <ExpensesScreen
              onEdit={(id) => openExpense(id)}
              onViewReceipt={(id) => void viewReceipt(id)}
              onlyMissingExternal={findMissing}
              onClearMissingExternal={() => setFindMissing(false)}
            />
          )}
          {!loading && !error && view === 'Receipts' && (
            <ReceiptsScreen
              onFindMissing={() => {
                setFindMissing(true);
                setView('Expenses');
              }}
              onSnap={() => setSnapOpen(true)}
              onViewReceipt={(id) => void viewReceipt(id)}
              onEdit={(id) => openExpense(id)}
            />
          )}
          {!loading && !error && view === 'Accounts' && (
            <AccountsScreen onImport={() => setImportOpen(true)} />
          )}
          {!loading && !error && view === 'Settings' && (
            <SetupScreen onSetup={() => setSetupOpen(true)} />
          )}
        </div>
        <footer>
          <span>
            ◈{' '}
            {localPreview
              ? 'Saved in this browser only (does not sync across devices)'
              : 'Saved to your signed-in account'}{' '}
            · Export anytime in Setup.
          </span>
          <span>U.S. expense-organizing suggestions · Tax eligibility needs review.</span>
        </footer>
      </main>

      <SetupDialog open={setupOpen} onClose={() => setSetupOpen(false)} />
      <ExpenseDialog
        open={expenseOpen}
        expenseId={expenseId}
        onClose={() => {
          setExpenseOpen(false);
          setExpenseId(null);
        }}
        onReadReceipt={(file) => {
          setExpenseOpen(false);
          setExpenseId(null);
          setSnapFile(file);
          setSnapOpen(true);
        }}
      />
      <DecisionDialog
        open={decisionOpen}
        expenseId={decisionId}
        useType={decisionUse}
        onClose={() => {
          setDecisionOpen(false);
          setDecisionId(null);
          setDecisionUse(null);
        }}
      />
      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => setView('Review')}
        onReadReceipt={(file) => {
          setImportOpen(false);
          setSnapFile(file);
          setSnapOpen(true);
        }}
      />
      <SnapReceiptDialog
        open={snapOpen}
        initialFile={snapFile}
        onClose={() => {
          setSnapOpen(false);
          setSnapFile(null);
        }}
      />
      <Toast />
    </>
  );
}
