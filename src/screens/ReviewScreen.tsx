import { money, recordDate, suggest } from '../lib/core';
import { useWorkspace } from '../context/WorkspaceContext';
import { Stats } from '../components/Stats';
import type { ExpenseRecord } from '../lib/types';

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

export function ReviewScreen({
  onSetup,
  onAdd,
  onImport,
  onSnap,
  onEdit,
  onDecide,
  onPersonal,
  onExclude,
}: {
  onSetup: () => void;
  onAdd: () => void;
  onImport: () => void;
  onSnap: () => void;
  onEdit: (id: string) => void;
  onDecide: (id: string, use: 'Business' | 'Split') => void;
  onPersonal: (id: string) => void;
  onExclude: (id: string) => void;
}) {
  const { records, profile, rules } = useWorkspace();
  const pending = records.filter((r) => !r.reviewed);
  const n = pending.length;

  function reviewCard(r: ExpenseRecord) {
    const s = suggest(r, profile, rules);
    return (
      <article className="reviewcard" key={r.id}>
        <div className="reviewtop">
          <span className="icon">{r.merchant.slice(0, 1)}</span>
          <div>
            <strong>{r.merchant}</strong>
            <p>
              {recordDate(r)} · {r.account || r.source || 'Manual expense'}
            </p>
          </div>
          <div className="money">{money(r.amount)}</div>
        </div>
        <div className="suggestion">
          <strong>✧ {s.label}</strong>
          {s.reason}
          <div className="ruleline">
            {s.category}
            {s.remembered ? ` · Suggested use: ${s.use}` : ''}
          </div>
        </div>
        <div className="reviewbuttons">
          <button type="button" className="btn secondary" onClick={() => onDecide(r.id, 'Business')}>
            ▱ Business
          </button>
          <button type="button" className="btn secondary" onClick={() => onPersonal(r.id)}>
            ◯ Personal
          </button>
          <button type="button" className="btn secondary" onClick={() => onDecide(r.id, 'Split')}>
            ◐ Split
          </button>
          <button
            type="button"
            className="edit"
            onClick={() => onEdit(r.id)}
            aria-label={`Edit ${r.merchant}`}
          >
            Edit
          </button>
        </div>
        {s.category === 'Transfers & payments' && (
          <button
            type="button"
            className="linkbtn"
            style={{ marginTop: 13 }}
            onClick={() => onExclude(r.id)}
          >
            Exclude payment / transfer from expenses
          </button>
        )}
      </article>
    );
  }

  return (
    <>
      {!profile.complete && (
        <div className="hero">
          <span className="orb">✧</span>
          <div>
            <h2>Start with a little about you.</h2>
            <p>Personal, business, or both? Tailor suggestions in a few taps.</p>
          </div>
          <button type="button" className="btn" onClick={onSetup}>
            Quick setup →
          </button>
        </div>
      )}
      <Stats />
      <div className="sectiontitle">
        <h2>{n ? `${n} expense${n === 1 ? '' : 's'} to review` : 'Your review inbox'}</h2>
        <span className="tag">{n ? 'Newest first' : 'You’re all caught up'}</span>
      </div>
      <div className="twocol">
        <div>
          {n ? (
            pending
              .slice()
              .sort((a, b) => b.date.localeCompare(a.date))
              .slice(0, 15)
              .map(reviewCard)
          ) : (
            <div className="panel emptyhero">
              <span style={{ fontSize: 34 }}>{records.length ? '✓' : '◫'}</span>
              <h2>
                {records.length ? 'A little more peace of mind.' : 'Your next expense has a home.'}
              </h2>
              <p>
                {records.length
                  ? 'Everything has been reviewed. You can always change a choice in Expenses.'
                  : 'Add one expense or import a statement. We’ll organize it for a quick review.'}
              </p>
              <div className="actions">
                <button type="button" className="btn" onClick={onSnap}>
                  Snap a receipt
                </button>
                <button type="button" className="btn secondary" onClick={onImport}>
                  Import a statement
                </button>
                <button type="button" className="btn secondary" onClick={onAdd}>
                  Add an expense
                </button>
              </div>
            </div>
          )}
          {n > 15 && <p className="helper">Review these to reveal the next expenses.</p>}
        </div>
        <div className="panel review-aside">
          <div className="kicker">A LIGHTER ROUTINE</div>
          <h2>You’re in control.</h2>
          <div className="quicksteps">
            <div>
              <b>1</b>
              <strong>Bring expenses in</strong>
              <span>Import a statement or add a receipt.</span>
            </div>
            <div>
              <b>2</b>
              <strong>Give it a quick look</strong>
              <span>Plain-language suggestions help you choose business, personal or split.</span>
            </div>
            <div>
              <b>3</b>
              <strong>Keep the useful details</strong>
              <span>Add context when needed. Save a merchant preference to make next time easier.</span>
            </div>
          </div>
          <div className="notice" style={{ margin: '20px 0' }}>
            A use classification is not a tax deduction. Confirmed eligible totals stay separate.
          </div>
          <p className="helper">U.S. references: {sourceLinks}</p>
        </div>
      </div>
    </>
  );
}
