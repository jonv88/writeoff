import { useEffect, useRef, useState, type FormEvent } from 'react';
import { categories, categoryFor, suggest, today, uid } from '../../lib/core';
import type { ExpenseRecord, ExpenseUse } from '../../lib/types';
import { useWorkspace } from '../../context/WorkspaceContext';

export function ExpenseDialog({
  open,
  expenseId,
  onClose,
}: {
  open: boolean;
  expenseId: string | null;
  onClose: () => void;
}) {
  const { records, profile, rules, saveRecord, removeRecord } = useWorkspace();
  const ref = useRef<HTMLDialogElement>(null);
  const old = expenseId ? records.find((r) => r.id === expenseId) : undefined;

  const [merchant, setMerchant] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [category, setCategory] = useState('Other');
  const [type, setType] = useState<ExpenseUse>('Unsorted');
  const [entity, setEntity] = useState('');
  const [share, setShare] = useState(50);
  const [notes, setNotes] = useState('');
  const [percent, setPercent] = useState(0);
  const [eligibilityChecked, setEligibilityChecked] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [receiptInfo, setReceiptInfo] = useState('');
  const [error, setError] = useState('');
  const [taxOpen, setTaxOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [categoryExplicit, setCategoryExplicit] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      if (old) {
        setMerchant(old.merchant);
        setAmount(String(old.amount));
        setDate(old.date);
        const chosen = Boolean(
          (old.treatmentSource === 'user' || old.treatmentSource === 'tax_pro' || old.reviewed) &&
            old.category,
        );
        setCategoryExplicit(chosen);
        setCategory(chosen ? old.category : categoryFor(old.merchant));
        setType(old.type || 'Unsorted');
        setEntity(old.entity || '');
        setShare(old.share || 50);
        setNotes(old.notes || '');
        setPercent(old.percent || 0);
        setEligibilityChecked(!!old.eligibilityChecked);
        setReceiptInfo(old.receipt ? `Attached: ${old.receipt.name}. A new file replaces it.` : '');
        setTaxOpen(!!old.eligibilityChecked || (old.percent || 0) > 0);
      } else {
        setMerchant('');
        setAmount('');
        setDate(today());
        setCategory('Other');
        setCategoryExplicit(false);
        setType('Unsorted');
        setEntity('');
        setShare(50);
        setNotes('');
        setPercent(0);
        setEligibilityChecked(false);
        setReceiptInfo('');
        setTaxOpen(false);
      }
      setFile(null);
      setError('');
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open, old]);

  const hint = suggest(
    {
      merchant,
      category,
      notes,
      categoryExplicit,
      treatmentSource: categoryExplicit ? 'user' : 'suggestion',
    },
    profile,
    rules,
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (percent > 0 && !eligibilityChecked) {
        throw new Error('Confirm that you have checked the eligible portion, or leave it at 0.');
      }
      if (type === 'Unsorted' && percent > 0) {
        throw new Error('Choose how the expense was used before recording an eligible portion.');
      }
      const bizShare = type === 'Business' ? 100 : type === 'Split' ? share : 0;
      if (['Business', 'Split'].includes(type) && percent > bizShare) {
        throw new Error('The eligible portion cannot exceed the business-use portion.');
      }
      if (!merchant.trim()) throw new Error('Please enter a merchant.');
      const amountNum = Number(amount);
      if (!Number.isFinite(amountNum) || amountNum < 0.01) {
        throw new Error('Please enter a valid amount.');
      }

      const record: ExpenseRecord = {
        id: old?.id || uid(),
        merchant: merchant.trim(),
        amount: amountNum,
        currency: old?.currency || 'USD',
        date,
        category,
        type,
        share: bizShare,
        entity: entity.trim(),
        notes: notes.trim(),
        percent,
        eligibilityChecked: percent > 0 && eligibilityChecked,
        reviewed: type !== 'Unsorted' ? true : !!old?.reviewed,
        source: old?.source || 'Manual expense',
        account: old?.account || '',
        receipt: old?.receipt || null,
        treatmentSource: 'user',
      };
      await saveRecord(record, file);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save expense.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      id="expenseDialog"
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <form id="expenseform" onSubmit={onSubmit}>
        <div className="panelhead">
          <h2 id="expenseheading">{old ? 'Edit expense' : 'Add an expense'}</h2>
          <button type="button" className="edit" onClick={onClose} aria-label="Close expense">
            ✕
          </button>
        </div>
        <div className="row">
          <label>
            Merchant
            <input
              id="merchant"
              required
              maxLength={100}
              placeholder="Who did you pay?"
              value={merchant}
              onChange={(e) => {
                const v = e.target.value;
                setMerchant(v);
                if (!old && !categoryExplicit) setCategory(categoryFor(v));
              }}
            />
          </label>
          <label>
            Amount ($)
            <input
              id="amount"
              type="number"
              min={0.01}
              max={999999999}
              step={0.01}
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
        </div>
        <div className="row">
          <label>
            Date
            <input
              type="date"
              id="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label>
            Category
            <select
              id="formcategory"
              value={category}
              onChange={(e) => {
                setCategoryExplicit(true);
                setCategory(e.target.value);
              }}
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="row">
          <label>
            Used for
            <select
              id="type"
              value={type}
              onChange={(e) => setType(e.target.value as ExpenseUse)}
            >
              <option value="Unsorted">Not sure yet</option>
              <option>Business</option>
              <option>Personal</option>
              <option>Split</option>
            </select>
          </label>
          <label>
            Name / business
            <input
              id="entity"
              maxLength={100}
              value={entity}
              onChange={(e) => setEntity(e.target.value)}
            />
          </label>
        </div>
        {type === 'Split' && (
          <label id="sharelabel">
            Business share (%)
            <input
              id="share"
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
        <label>
          Purpose / notes
          <textarea
            id="notes"
            rows={2}
            maxLength={1000}
            placeholder="A short note for future you"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <div id="formSuggestion" className="notice">
          {hint.label}: {hint.reason}
          {hint.question ? ` ${hint.question}` : ''}
        </div>
        <label>
          Receipt · image or PDF, up to 3 MB
          <input
            type="file"
            id="receipt"
            accept="image/*,application/pdf"
            capture="environment"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </label>
        <div id="receiptinfo" className="formhint">
          {receiptInfo}
        </div>
        <details
          id="taxdetails"
          open={taxOpen}
          onToggle={(e) => setTaxOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary>Optional: amount already checked for tax eligibility</summary>
          <p className="helper">
            Leave this at 0 unless you or your tax professional have checked the eligible portion.
            Business use alone does not establish a tax deduction.
          </p>
          <label>
            Eligible portion of the full expense (%)
            <input
              id="percent"
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={percent}
              onChange={(e) => setPercent(Number(e.target.value))}
              required
            />
          </label>
          <label className="checkbox">
            <input
              id="eligibilitychecked"
              type="checkbox"
              checked={eligibilityChecked}
              onChange={(e) => setEligibilityChecked(e.target.checked)}
            />
            I have checked this portion for tax eligibility.
          </label>
        </details>
        {error && (
          <div id="expenseerror" className="formerror" role="alert">
            {error}
          </div>
        )}
        <div className="dialogactions">
          {old && (
            <button
              type="button"
              className="btn secondary"
              id="delete"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await removeRecord(old.id);
                  onClose();
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Could not delete.');
                } finally {
                  setBusy(false);
                }
              }}
            >
              Delete
            </button>
          )}
          <button type="button" className="btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" id="saveexpense" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save expense'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
