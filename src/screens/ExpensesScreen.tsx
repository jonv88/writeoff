import { useEffect, useMemo, useState } from 'react';
import { categories, money, recordDate } from '../lib/core';
import { useWorkspace } from '../context/WorkspaceContext';
import { Stats } from '../components/Stats';

export function ExpensesScreen({
  onEdit,
  onViewReceipt,
  onlyMissingExternal,
  onClearMissingExternal,
}: {
  onEdit: (id: string) => void;
  onViewReceipt: (id: string) => void;
  onlyMissingExternal?: boolean;
  onClearMissingExternal?: () => void;
}) {
  const { records, showToast } = useWorkspace();
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState('All');
  const [year, setYear] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);

  useEffect(() => {
    if (onlyMissingExternal) {
      setOnlyMissing(true);
      onClearMissingExternal?.();
    }
  }, [onlyMissingExternal, onClearMissingExternal]);

  const years = useMemo(
    () => [...new Set(records.map((r) => r.date.slice(0, 4)))].sort().reverse(),
    [records],
  );

  const filtered = records
    .filter(
      (r) =>
        (!onlyMissing || !r.receipt) &&
        (scope === 'All' || r.type === scope) &&
        (!year || r.date.startsWith(year)) &&
        (!filterCat || r.category === filterCat) &&
        (!search ||
          [r.merchant, r.entity, r.notes, r.account].join(' ').toLowerCase().includes(search.toLowerCase())),
    )
    .sort((a, b) => b.date.localeCompare(a.date));

  function exportCSV() {
    const rows = [
      [
        'Merchant',
        'Date',
        'Category',
        'Use',
        'Business share (%)',
        'Use reviewed',
        'Amount (USD)',
        'Eligible portion (%)',
        'Eligibility checked',
        'User-marked eligible amount',
        'Notes',
        'Entity',
        'Account',
        'Source',
        'Receipt filename',
      ],
      ...filtered.map((r) => [
        r.merchant,
        r.date,
        r.category,
        r.type,
        String(r.share || 0),
        r.reviewed ? 'Yes' : 'No',
        String(r.amount),
        String(r.percent || 0),
        r.eligibilityChecked ? 'Yes' : 'No',
        r.eligibilityChecked ? ((r.amount * r.percent) / 100).toFixed(2) : '0.00',
        r.notes,
        r.entity,
        r.account,
        r.source,
        r.receipt?.name || '',
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
    showToast(`${filtered.length} expense records exported. Receipt files stay in private storage.`);
  }

  return (
    <>
      <Stats />
      <section className="panel ledger">
        <div className="ledgerhead">
          <h2>Expense records</h2>
          <div className="inlinebuttons">
            <button type="button" className="btn secondary" onClick={exportCSV}>
              Export filtered CSV ↗
            </button>
          </div>
        </div>
        <div className="filters">
          <input
            id="search"
            aria-label="Search expenses"
            placeholder="Search merchants, notes, or accounts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            id="receiptfilter"
            aria-label="Receipt filter"
            value={onlyMissing ? 'missing' : 'all'}
            onChange={(e) => setOnlyMissing(e.target.value === 'missing')}
          >
            <option value="all">All receipts</option>
            <option value="missing">Missing receipt</option>
          </select>
          <select
            id="scope"
            aria-label="Expense use"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
          >
            {['All', 'Business', 'Personal', 'Split', 'Unsorted'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <select id="year" aria-label="Tax year" value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">All years</option>
            {years.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <select
            id="category"
            aria-label="Filter category"
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </div>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Expense</th>
                <th>Date</th>
                <th>Use</th>
                <th>Status</th>
                <th>Receipt</th>
                <th>Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="merchant">
                      <span className="icon">{r.merchant.slice(0, 1)}</span>
                      <div>
                        <strong>{r.merchant}</strong>
                        <small>
                          {r.category} · {r.entity || r.account || ''}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>{recordDate(r)}</td>
                  <td>
                    {r.type || 'Unsorted'}
                    {r.type === 'Split' ? ` (${r.share}% work)` : ''}
                  </td>
                  <td>
                    <span className={`badge ${r.reviewed ? '' : 'statuspending'}`}>
                      {r.reviewed ? 'Use reviewed' : 'Needs review'}
                    </span>
                    {r.eligibilityChecked && (
                      <div className="ruleline">Eligible portion checked</div>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="linkbtn"
                      onClick={() => (r.receipt ? onViewReceipt(r.id) : onEdit(r.id))}
                    >
                      {r.receipt ? 'View ↗' : '＋ Attach'}
                    </button>
                  </td>
                  <td className="money">{money(r.amount)}</td>
                  <td>
                    <button
                      type="button"
                      className="edit"
                      onClick={() => onEdit(r.id)}
                      aria-label={`Edit ${r.merchant}`}
                    >
                      ✎
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && (
            <div className="empty">No expenses match. Try another filter or add an expense.</div>
          )}
        </div>
        <div className="foot">
          <span>
            {filtered.length} records · {money(filtered.reduce((s, r) => s + r.amount, 0))}
          </span>
          <span>CSV includes use, status and eligible portion.</span>
        </div>
      </section>
    </>
  );
}
