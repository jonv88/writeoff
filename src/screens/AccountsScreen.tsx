import { useWorkspace } from '../context/WorkspaceContext';

export function AccountsScreen({ onImport }: { onImport: () => void }) {
  const { records } = useWorkspace();
  const csvCount = records.filter((r) => r.source === 'CSV import').length;

  return (
    <div className="twocol">
      <div className="panel">
        <div className="accounticon">▱</div>
        <div className="kicker">BANKS & CARDS</div>
        <h2 style={{ fontSize: 23, marginBottom: 12 }}>Live bank sync isn’t active yet.</h2>
        <p>
          Bank or card linking is not available inside Writeoff at this stage. Your bank password is
          never requested here.
        </p>
        <div className="notice" style={{ margin: '21px 0' }}>
          Connecting Finances to ChatGPT does not automatically connect an account to this app. No
          live transactions are being imported or refreshed here.
        </div>
        <span className="badge statuspending">Bank integration pending</span>
        <div className="sectiontitle">
          <h2>Use a statement for now.</h2>
        </div>
        <p>
          Import a CSV from your bank or card. Preview the expenses, then review suggestions in a
          few taps.
        </p>
        <button type="button" className="btn" onClick={onImport} style={{ marginTop: 20 }}>
          Import a statement ↓
        </button>
      </div>
      <div className="panel">
        <div className="kicker">YOUR DATA</div>
        <h2>A clear picture of what’s connected.</h2>
        <div className="rule">
          <span>Live bank connections</span>
          <b>0 in this app</b>
        </div>
        <div className="rule">
          <span>Automatic bank sync</span>
          <b>Not enabled</b>
        </div>
        <div className="rule">
          <span>Storage</span>
          <b>Signed-in account (Supabase)</b>
        </div>
        <div className="rule">
          <span>Statement imports</span>
          <b>{csvCount} expenses</b>
        </div>
        <p className="helper" style={{ marginTop: 20 }}>
          Live linking requires an authorized banking integration and a secure server connection.
          This page never pretends an account is connected.
        </p>
      </div>
    </div>
  );
}
