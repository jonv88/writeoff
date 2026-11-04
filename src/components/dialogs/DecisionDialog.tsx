import { useEffect, useRef, useState, type FormEvent } from 'react';
import { money, suggest, normalize } from '../../lib/core';
import type { ExpenseUse } from '../../lib/types';
import { useWorkspace } from '../../context/WorkspaceContext';

export function DecisionDialog({
  open,
  expenseId,
  useType,
  onClose,
}: {
  open: boolean;
  expenseId: string | null;
  useType: 'Business' | 'Split' | null;
  onClose: () => void;
}) {
  const { records, profile, rules, saveRecord, rememberRule, showToast } = useWorkspace();
  const ref = useRef<HTMLDialogElement>(null);
  const record = expenseId ? records.find((r) => r.id === expenseId) : undefined;
  const s = record ? suggest(record, profile, rules) : null;

  const [purpose, setPurpose] = useState('');
  const [share, setShare] = useState(50);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && record && useType && !el.open) {
      setPurpose(record.notes || '');
      setShare(s?.share || 50);
      setRemember(false);
      setError('');
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open, record, useType, s?.share]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!record || !useType) return;
    if (!purpose.trim()) {
      setError('Add a short purpose so the record is useful later.');
      return;
    }
    setBusy(true);
    try {
      const nextShare = useType === 'Split' ? share : 100;
      const category = suggest(record, profile, rules).category;
      await saveRecord({
        ...record,
        type: useType as ExpenseUse,
        share: nextShare,
        category,
        reviewed: true,
        notes: purpose.trim(),
        percent: 0,
        eligibilityChecked: false,
        treatmentSource: 'user',
        currency: record.currency || 'USD',
      });
      if (remember) {
        await rememberRule({
          merchant: normalize(record.merchant),
          type: useType,
          share: nextShare,
          category,
        });
      }
      showToast('Use confirmed. Eligible amount stays separate.');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  if (!useType) return null;

  return (
    <dialog
      id="decisionDialog"
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <form id="decisionform" onSubmit={onSubmit}>
        <div className="panelhead">
          <h2 id="decisiontitle">
            {useType === 'Split' ? 'A little work. A little life.' : 'What was the work purpose?'}
          </h2>
          <button type="button" className="edit" onClick={onClose} aria-label="Close review">
            ✕
          </button>
        </div>
        {record && s && (
          <div id="decisioninfo">
            <div className="reviewtop">
              <strong>{record.merchant}</strong>
              <b className="money">{money(record.amount)}</b>
            </div>
            <div className="suggestion">
              <strong>{s.label}</strong>
              {s.reason}
            </div>
          </div>
        )}
        {useType === 'Split' && (
          <label id="decisionShareLabel">
            Business share (%)
            <input
              id="decisionshare"
              type="number"
              min={1}
              max={99}
              step={1}
              value={share}
              onChange={(e) => setShare(Number(e.target.value))}
              required
            />
          </label>
        )}
        <label id="purposeLabel">
          What was it for?
          <input
            id="purpose"
            maxLength={300}
            placeholder="e.g. Editing software for client work"
            required
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
          />
        </label>
        <div className="notice" id="decisionhint">
          This records {useType.toLowerCase()} use. It does not mark the expense as tax deductible.
          You can add an eligible amount later after checking it.
        </div>
        <label className="checkbox">
          <input
            id="remember"
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          Suggest this use and category for future expenses at this merchant. Always let me review.
        </label>
        {error && (
          <div className="formerror" id="decisionerror" role="alert">
            {error}
          </div>
        )}
        <div className="dialogactions">
          <button type="button" className="btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" type="submit" disabled={busy}>
            Confirm use
          </button>
        </div>
      </form>
    </dialog>
  );
}
