import { money, suggest } from '../lib/core';
import { useWorkspace } from '../context/WorkspaceContext';

export function Stats() {
  const { records, profile, rules } = useWorkspace();
  const pending = records.filter((r) => !r.reviewed).length;
  const total = records.reduce((s, r) => s + r.amount, 0);
  const eligible = records
    .filter((r) => r.eligibilityChecked)
    .reduce((s, r) => s + (r.amount * r.percent) / 100, 0);
  const possible = records
    .filter(
      (r) =>
        !r.reviewed &&
        ['Possible business expense', 'Possible work equipment', 'Possible personal tax record'].includes(
          suggest(r, profile, rules).label,
        ),
    )
    .reduce((s, r) => s + r.amount, 0);

  return (
    <section className="stats">
      <div className="stat primary">
        <div className="label">
          Ready to review <span>◫</span>
        </div>
        <div className="value">{pending}</div>
        <div className="small">One quick decision at a time</div>
      </div>
      <div className="stat">
        <div className="label">
          Possible records to review <span>✧</span>
        </div>
        <div className="value">{money(possible)}</div>
        <div className="small">Full expense amounts · not deduction totals</div>
      </div>
      <div className="stat">
        <div className="label">
          You marked eligible <span>✓</span>
        </div>
        <div className="value">{money(eligible)}</div>
        <div className="small">Only portions you explicitly checked</div>
      </div>
      <div className="stat">
        <div className="label">
          Total recorded <span>▱</span>
        </div>
        <div className="value">{money(total)}</div>
        <div className="small">
          {records.length} expense{records.length === 1 ? '' : 's'} · all years
        </div>
      </div>
    </section>
  );
}
