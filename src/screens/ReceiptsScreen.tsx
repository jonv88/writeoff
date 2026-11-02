import { money, recordDate } from '../lib/core';
import { useWorkspace } from '../context/WorkspaceContext';

export function ReceiptsScreen({
  onFindMissing,
  onSnap,
  onViewReceipt,
  onEdit,
}: {
  onFindMissing: () => void;
  onSnap: () => void;
  onViewReceipt: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  const { records } = useWorkspace();
  const receipts = records.filter((r) => r.receipt);
  const missing = records.filter((r) => !r.receipt);

  return (
    <>
      <div className="hero">
        <span className="orb">▧</span>
        <div>
          <h2>
            {missing.length} expense{missing.length === 1 ? ' needs' : 's need'} a receipt.
          </h2>
          <p>Choose an expense, then photograph or upload its receipt.</p>
        </div>
        <button type="button" className="btn" onClick={onSnap} style={{ marginRight: 8 }}>
          Snap a receipt
        </button>
        <button type="button" className="btn secondary" onClick={onFindMissing}>
          Find missing →
        </button>
      </div>
      <div className="receipt-list">
        {receipts.map((r) => (
          <div className="receiptcard" key={r.id}>
            <span className="icon">▧</span>
            <h2>{r.merchant}</h2>
            <p>
              {recordDate(r)} · {money(r.amount)}
            </p>
            <div className="helper">{r.receipt?.name}</div>
            <button type="button" className="btn secondary" onClick={() => onViewReceipt(r.id)}>
              Open receipt ↗
            </button>
            <button type="button" className="edit" onClick={() => onEdit(r.id)}>
              Edit
            </button>
          </div>
        ))}
      </div>
      {!receipts.length && (
        <div className="panel emptyhero">
          <h2>No receipts attached yet.</h2>
          <p>Attach one to an expense. It stays with that record.</p>
        </div>
      )}
      <p className="helper" style={{ marginTop: 20 }}>
        Snap a receipt runs extraction when <code>VITE_OCR_ENDPOINT</code> is configured; otherwise
        you review and enter details manually. Matching to an existing expense is offered before save.
      </p>
    </>
  );
}
