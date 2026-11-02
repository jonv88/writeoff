import { useEffect, useRef, useState, type FormEvent } from 'react';
import { categoryFor, today, uid } from '../../lib/core';
import { extractReceipt, isOcrConfigured } from '../../lib/ocr/adapter';
import { suggestWriteOff } from '../../lib/writeoffEngine';
import { emptyExpense } from '../../lib/types';
import { useWorkspace } from '../../context/WorkspaceContext';

type Phase = 'pick' | 'reading' | 'review';

export function SnapReceiptDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { profile, rules, records, saveRecord, showToast } = useWorkspace();
  const ref = useRef<HTMLDialogElement>(null);
  const [phase, setPhase] = useState<Phase>('pick');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [merchant, setMerchant] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [currency, setCurrency] = useState('USD');
  const [notes, setNotes] = useState('');
  const [uncertain, setUncertain] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [matchId, setMatchId] = useState<string>('');

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      setPhase('pick');
      setFile(null);
      setPreviewUrl(null);
      setStatusMsg('');
      setMerchant('');
      setAmount('');
      setDate(today());
      setCurrency('USD');
      setNotes('');
      setUncertain([]);
      setError('');
      setMatchId('');
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function acceptFile(f: File | undefined) {
    if (!f) return;
    if (f.size > 3 * 1024 * 1024) {
      setError('Choose a receipt smaller than 3 MB.');
      return;
    }
    if (
      !(
        /^image\/(jpeg|png|webp|gif|heic|heif)$/.test(f.type) ||
        f.type === 'application/pdf'
      )
    ) {
      setError('Choose a photo or PDF receipt.');
      return;
    }
    setError('');
    setFile(f);
    const url = URL.createObjectURL(f);
    setPreviewUrl(url);
    setPhase('reading');
    setStatusMsg(
      isOcrConfigured() ? 'Reading receipt…' : 'OCR not configured — prepare manual review…',
    );
    const result = await extractReceipt(f);
    setStatusMsg(result.message);
    setMerchant(result.merchant || '');
    setDate(result.date || today());
    setAmount(result.total != null ? String(result.total) : '');
    setCurrency(result.currency || 'USD');
    setUncertain(result.uncertainFields);
    setPhase('review');

    // Suggest match by merchant/date/amount when possible
    if (result.merchant && result.date && result.total != null) {
      const hit = records.find(
        (r) =>
          r.merchant.toLowerCase() === result.merchant!.toLowerCase() &&
          r.date === result.date &&
          Math.abs(r.amount - result.total!) < 0.005,
      );
      if (hit) setMatchId(hit.id);
    }
  }

  const draftCategory = categoryFor(merchant);
  const suggestion = suggestWriteOff(
    { merchant, category: draftCategory, type: 'Unsorted', notes, reviewed: false, treatmentSource: 'suggestion', percent: 0, eligibilityChecked: false },
    profile,
    rules,
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (!merchant.trim()) throw new Error('Please enter a merchant.');
      const amountNum = Number(amount);
      if (!Number.isFinite(amountNum) || amountNum < 0.01) {
        throw new Error('Please enter a valid amount.');
      }

      if (matchId) {
        const existing = records.find((r) => r.id === matchId);
        if (!existing) throw new Error('Selected match was not found.');
        await saveRecord(
          {
            ...existing,
            notes: notes.trim() || existing.notes,
            receipt: existing.receipt,
          },
          file,
        );
        showToast('Receipt attached to the matching expense.');
        onClose();
        return;
      }

      const record = emptyExpense({
        id: uid(),
        merchant: merchant.trim(),
        amount: amountNum,
        currency,
        date,
        category: suggestion.category,
        type: 'Unsorted',
        notes: notes.trim(),
        source: 'Receipt capture',
        treatmentSource: 'suggestion',
        suggestedStatus: suggestion.status,
        suggestionReason: suggestion.reason,
        suggestionRuleId: suggestion.ruleId,
        suggestionRuleVersion: suggestion.ruleVersion,
        receipt: {
          name: file?.name || 'receipt',
          storagePath: '',
          extractionStatus: uncertain.length ? 'needs_details' : 'ready',
          extractionVersion: suggestion.ruleVersion,
        },
      });
      await saveRecord(record, file);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      id="snapReceiptdialog"
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <form onSubmit={onSubmit}>
        <div className="panelhead">
          <h2>Snap a receipt</h2>
          <button type="button" className="edit" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p>Photograph or choose a receipt. No bank connection required.</p>

        {phase === 'pick' && (
          <div className="importbox">
            <label>
              Camera or photo library
              <input
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                onChange={(e) => void acceptFile(e.target.files?.[0])}
              />
            </label>
            <p className="formhint">
              JPEG, PNG, WebP, HEIC or PDF · up to 3 MB. Cancel anytime — nothing is saved until you
              confirm.
            </p>
          </div>
        )}

        {phase === 'reading' && <div className="notice">{statusMsg || 'Working…'}</div>}

        {phase === 'review' && (
          <>
            {previewUrl && (
              <div className="notice" style={{ marginBottom: 12 }}>
                <div className="formhint" style={{ marginBottom: 8 }}>
                  Preview
                </div>
                {file?.type.startsWith('image/') ? (
                  <img
                    src={previewUrl}
                    alt="Receipt preview"
                    style={{ maxWidth: '100%', maxHeight: 180, borderRadius: 8 }}
                  />
                ) : (
                  <span>{file?.name}</span>
                )}
              </div>
            )}
            <div className={`notice ${uncertain.length ? 'warningnote' : ''}`}>{statusMsg}</div>
            {uncertain.length > 0 && (
              <p className="formhint">Check highlighted fields: {uncertain.join(', ')}.</p>
            )}
            <div className="row">
              <label>
                Merchant
                <input
                  required
                  maxLength={100}
                  value={merchant}
                  onChange={(e) => setMerchant(e.target.value)}
                  style={uncertain.includes('merchant') ? { borderColor: '#c4a35a' } : undefined}
                />
              </label>
              <label>
                Amount
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  style={uncertain.includes('total') ? { borderColor: '#c4a35a' } : undefined}
                />
              </label>
            </div>
            <div className="row">
              <label>
                Date
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  style={uncertain.includes('date') ? { borderColor: '#c4a35a' } : undefined}
                />
              </label>
              <label>
                Currency
                <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  <option value="USD">USD</option>
                  <option value="CAD">CAD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                </select>
              </label>
            </div>
            <label>
              Purpose / notes
              <textarea
                rows={2}
                maxLength={1000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional — helps suggestions"
              />
            </label>
            <div className="suggestion">
              <strong>✧ {suggestion.label}</strong>
              {suggestion.reason}
              <div className="ruleline">
                {suggestion.category} · {suggestion.ruleId} {suggestion.ruleVersion}
              </div>
            </div>
            {records.filter((r) => !r.receipt).length > 0 && (
              <label>
                Match an existing expense instead?
                <select value={matchId} onChange={(e) => setMatchId(e.target.value)}>
                  <option value="">Create a new expense from this receipt</option>
                  {records
                    .filter((r) => !r.receipt)
                    .slice(0, 40)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.merchant} · {r.date} · {r.amount}
                      </option>
                    ))}
                </select>
              </label>
            )}
          </>
        )}

        {error && (
          <div className="formerror" role="alert">
            {error}
          </div>
        )}
        <div className="dialogactions">
          <button type="button" className="btn secondary" onClick={onClose}>
            Cancel
          </button>
          {phase === 'review' && (
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Saving…' : matchId ? 'Attach to match' : 'Save expense'}
            </button>
          )}
        </div>
      </form>
    </dialog>
  );
}
