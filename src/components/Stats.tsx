import { money } from '../lib/core';
import { summarizeExpenses } from '../lib/writeoffEngine';
import { useWorkspace } from '../context/WorkspaceContext';

export function Stats() {
  const { records, profile, rules } = useWorkspace();
  const s = summarizeExpenses(records, profile, rules);

  return (
    <section className="stats">
      <div className="stat primary">
        <div className="label">
          Ready to review <span>◫</span>
        </div>
        <div className="value">{s.pending}</div>
        <div className="small">One quick decision at a time</div>
      </div>
      <div className="stat">
        <div className="label">
          Possible write-offs <span>✧</span>
        </div>
        <div className="value">{money(s.possibleWriteOffs)}</div>
        <div className="small">Flagged amounts · not tax savings</div>
      </div>
      <div className="stat">
        <div className="label">
          Eligible % you set <span>✓</span>
        </div>
        <div className="value">{money(s.eligibleSelected)}</div>
        <div className="small">Only portions you explicitly checked</div>
      </div>
      <div className="stat">
        <div className="label">
          Total recorded <span>▱</span>
        </div>
        <div className="value">{money(s.total)}</div>
        <div className="small">
          {s.count} expense{s.count === 1 ? '' : 's'} · biz use {money(s.businessUse)}
        </div>
      </div>
    </section>
  );
}
