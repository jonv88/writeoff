import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { openSandboxLink } from '../lib/bank/plaidLink';
type Connection = { id: string; status: string; last_synced_at: string | null };
type Transaction = { connection_id: string; provider_id: string; merchant: string; amount_cents: number; currency: string | null; transaction_date: string; pending: boolean; removed: boolean; kind: string; expense_id: string | null };
export function BankSandboxPanel() {
  const { session } = useAuth(); const { refresh, records } = useWorkspace();
  const [connections, setConnections] = useState<Connection[]>([]), [transactions, setTransactions] = useState<Transaction[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const request = useCallback(async (body: object) => {
    const response = await fetch('/api/bank', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Bank request did not finish.'); return data;
  }, [session?.access_token]);
  const load = useCallback(async () => {
    const data = await request({ action: 'list' }); setConnections(data.connections); setTransactions(data.transactions);
  }, [request]);
  useEffect(() => { let active = true; setConnections([]); setTransactions([]);
    if (session) void request({ action: 'list' }).then(data => { if (active) { setConnections(data.connections); setTransactions(data.transactions); } }).catch(() => {});
    return () => { active = false; };
  }, [session, request]);
  async function run(action: () => Promise<void>) { setBusy(true); setError(''); try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); } finally { setBusy(false); } }
  async function connect(connectionId?: string) {
    const { link_token } = await request({ action: 'link', connectionId });
    const publicToken = await openSandboxLink(link_token);
    if (!publicToken) return;
    if (!connectionId) await request({ action: 'exchange', publicToken });
    await load();
  }
  if (!session) return null;
  return <div style={{ marginTop: 20 }}>
    <h2>Test a bank connection</h2>
    <p>Plaid Sandbox uses simulated accounts. It does not connect your real bank. Receipt capture works independently.</p>
    <button className="btn" disabled={busy} onClick={() => void run(() => connect())}>{busy ? 'Working…' : 'Connect a test bank'}</button>
    {error && <p role="alert" className="notice">{error}</p>}
    {connections.map(c => <div className="rule" key={c.id}><span>Sandbox bank · {c.status.replaceAll('_', ' ')}{c.last_synced_at && <small> · Synced {new Date(c.last_synced_at).toLocaleString()}</small>}</span>
      {c.status !== 'disconnected' && <span>
        <button className="btn" disabled={busy} onClick={() => void run(async () => { if (c.status === 'needs_reconnect') await connect(c.id); else { await request({ action: 'sync', connectionId: c.id }); await load(); } })}>{c.status === 'needs_reconnect' ? 'Reconnect' : 'Sync'}</button>
        <button className="btn" disabled={busy} onClick={() => { if (window.confirm('Disconnect this test bank? Saved expenses will be kept.')) void run(async () => { await request({ action: 'disconnect', connectionId: c.id }); await load(); }); }}>Disconnect</button>
      </span>}
    </div>)}
    {transactions.length > 0 && <><h2>Test transactions</h2><p>Import posted purchases explicitly. Pending entries, credits, and transfers stay out of expenses. A possible receipt match is held for reconciliation.</p></>}
    {transactions.map(t => <div className="rule" key={`${t.connection_id}:${t.provider_id}`}><span>{t.merchant} · {t.transaction_date}<br/>{t.currency || 'Unknown currency'} {(t.amount_cents / 100).toFixed(2)} · {t.removed ? 'Removed by provider — check saved expense' : t.pending ? 'Pending' : t.kind}{t.expense_id ? ' · Imported — check provider changes against your saved expense' : ''}</span>
      {!t.expense_id && !t.removed && !t.pending && t.kind === 'purchase' && t.amount_cents > 0 && t.currency && <button className="btn" disabled={busy} onClick={() => void run(async () => { await request({ action: 'import', connectionId: t.connection_id, transactionId: t.provider_id }); await load(); await refresh(); })}>Import</button>}
      {!t.expense_id && !t.pending && !t.removed && records.filter(r => r.currency === t.currency && Math.abs(Math.round(r.amount * 100) - t.amount_cents) <= 2 && Math.abs(Date.parse(r.date) - Date.parse(t.transaction_date)) <= 3 * 86400000).map(r => <button className="btn" key={r.id} disabled={busy} onClick={() => { if (window.confirm(`Match this transaction to ${r.merchant} on ${r.date}? Existing receipt and review choices will be kept.`)) void run(async () => { await request({ action: 'match', connectionId: t.connection_id, transactionId: t.provider_id, expenseId: r.id }); await load(); }); }}>Match {r.merchant} · {r.date}</button>)}
    </div>)}
  </div>;
}
