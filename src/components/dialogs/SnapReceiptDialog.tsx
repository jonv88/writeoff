import { useEffect, useRef, useState, type FormEvent } from 'react';
import { uid } from '../../lib/core';
import { extractReceipt } from '../../lib/ocr/adapter';
import { formatOcrAmount } from '../../lib/ocr/browserOcr';
import { mergeReceiptReading } from '../../lib/ocr/receiptEvidence';
import { ReceiptScanSession } from '../../lib/ocr/receiptScanSession';
import { requestServerExtraction } from '../../lib/ocr/serverExtraction';
import {
  clearReceiptDraft,
  clearReceiptPhoto,
  loadReceiptDraft,
  loadReceiptPhoto,
  saveReceiptDraft,
  saveReceiptPhoto,
  type ReceiptDraft,
} from '../../lib/receiptDraft';
import { suggestWriteOff } from '../../lib/writeoffEngine';
import { emptyExpense } from '../../lib/types';
import { APPROVED_PLAN } from '../../lib/billing/plan';
import { useWorkspace } from '../../context/WorkspaceContext';

const SESSION_KEY = 'writeoff.mockVeryfiSession.v1';

type MockSession = {
  snaps: number;
  reviews: number;
  savesWithoutTyping: number;
  fieldsLeftForReview: number;
};

function readSession(): MockSession {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return { snaps: 0, reviews: 0, savesWithoutTyping: 0, fieldsLeftForReview: 0 };
    const parsed = JSON.parse(raw) as Partial<MockSession>;
    return {
      snaps: Number(parsed.snaps) || 0,
      reviews: Number(parsed.reviews) || 0,
      savesWithoutTyping: Number(parsed.savesWithoutTyping) || 0,
      fieldsLeftForReview: Number(parsed.fieldsLeftForReview) || 0,
    };
  } catch {
    return { snaps: 0, reviews: 0, savesWithoutTyping: 0, fieldsLeftForReview: 0 };
  }
}

function writeSession(next: MockSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(next));
}

type Phase = 'pick' | 'reading' | 'review';
type PipelineState = 'idle' | 'photo_attached' | 'reading' | 'details_filled' | 'needs_manual';

type FieldKey = 'merchant' | 'amount' | 'date';

export function SnapReceiptDialog({
  open,
  onClose,
  initialFile = null,
}: {
  open: boolean;
  onClose: () => void;
  initialFile?: File | null;
}) {
  const { profile, rules, records, localPreview, saveRecord, showToast } = useWorkspace();
  const ref = useRef<HTMLDialogElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const startedFile = useRef<File | null>(null);
  /** Fields the user typed into — OCR must not overwrite these. */
  const userTouched = useRef<Record<FieldKey, boolean>>({
    merchant: false,
    amount: false,
    date: false,
  });
  const scanSession = useRef(new ReceiptScanSession());
  const [phase, setPhase] = useState<Phase>('pick');
  const [pipeline, setPipeline] = useState<PipelineState>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [providerLine, setProviderLine] = useState('');
  const [merchant, setMerchant] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [notes, setNotes] = useState('');
  const [purchaseItems, setPurchaseItems] = useState<{ name: string }[]>([]);
  const [uncertain, setUncertain] = useState<string[]>([]);
  const [fieldHints, setFieldHints] = useState<{
    merchant?: string;
    date?: string;
    total?: string;
  }>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [matchId, setMatchId] = useState<string>('');
  const [serverStoragePath, setServerStoragePath] = useState<string | null>(null);
  const [ocrProvider, setOcrProvider] = useState<string | null>(null);
  const [extractionStatus, setExtractionStatus] = useState<
    'none' | 'ready' | 'needs_details' | 'failed' | 'blocked'
  >('none');
  const [extractionVersion, setExtractionVersion] = useState('');
  const [captureHint, setCaptureHint] = useState('');
  const [, setSession] = useState<MockSession>(() => readSession());
  const [draftOffer, setDraftOffer] = useState<ReceiptDraft | null>(null);
  const draftSaved = useRef(false);

  useEffect(() => {
    scanSession.current.invalidate();
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      setPhase('pick');
      setPipeline('idle');
      setFile(null);
      setPreviewUrl(null);
      setStatusMsg('');
      setMerchant('');
      setAmount('');
      setDate('');
      setCurrency('USD');
      setNotes('');
      setUncertain([]);
      setFieldHints({});
      setError('');
      setMatchId('');
      setServerStoragePath(null);
      setOcrProvider(null);
      setExtractionStatus('none');
      setExtractionVersion('');
      setCaptureHint('');
      userTouched.current = { merchant: false, amount: false, date: false };
      draftSaved.current = false;
      setDraftOffer(loadReceiptDraft());
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      if (libraryInputRef.current) libraryInputRef.current.value = '';
      if (fileInputRef.current) fileInputRef.current.value = '';
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

  useEffect(() => () => scanSession.current.invalidate(), []);

  useEffect(() => {
    if (!open || phase !== 'review' || draftSaved.current) return;
    if (!merchant && !amount && !date) return;
    const draft = {
      merchant,
      amount,
      date,
      currency,
      notes,
      updatedAt: new Date().toISOString(),
    };
    saveReceiptDraft(draft);
    if (file) void saveReceiptPhoto(file, { name: file.name, type: file.type });
  }, [open, phase, merchant, amount, date, currency, notes, file]);

  function markTouched(key: FieldKey) {
    userTouched.current[key] = true;
  }

  function applyOcrToForm(result: {
    merchant: string | null;
    date: string | null;
    total: number | null;
    currency: string | null;
    uncertainFields: string[];
    fieldHints?: { merchant?: string; date?: string; total?: string };
    status: string;
    message: string;
  }) {
    // Only fill evidence-backed fields. Missing OCR values stay blank — never invent.
    if (!userTouched.current.merchant) {
      setMerchant(result.merchant?.trim() || '');
    }
    if (!userTouched.current.date) {
      setDate(result.date || '');
    }
    if (!userTouched.current.amount) {
      setAmount(result.total != null ? formatOcrAmount(result.total) : '');
    }
    if (result.currency) setCurrency(result.currency);

    const uncertainNext = [...result.uncertainFields];
    if (!userTouched.current.merchant && !result.merchant && !uncertainNext.includes('merchant')) {
      uncertainNext.push('merchant');
    }
    if (!userTouched.current.date && !result.date && !uncertainNext.includes('date')) {
      uncertainNext.push('date');
    }
    if (!userTouched.current.amount && result.total == null && !uncertainNext.includes('total')) {
      uncertainNext.push('total');
    }
    const uniqueUncertain = [...new Set(uncertainNext)].filter((field) => {
      if (field === 'merchant' && userTouched.current.merchant) return false;
      if (field === 'date' && userTouched.current.date) return false;
      if (field === 'total' && userTouched.current.amount) return false;
      return true;
    });
    setUncertain(uniqueUncertain);
    setFieldHints({
      merchant:
        result.fieldHints?.merchant ||
        (uniqueUncertain.includes('merchant') ? 'Confirm the merchant name' : undefined),
      date:
        result.fieldHints?.date ||
        (uniqueUncertain.includes('date') ? 'Confirm the purchase date' : undefined),
      total:
        result.fieldHints?.total ||
        (uniqueUncertain.includes('total') ? 'Confirm the final amount paid' : undefined),
    });

    const filledAny = Boolean(result.merchant || result.date || result.total != null);
    if (filledAny && result.status !== 'failed') {
      setPipeline('details_filled');
    } else {
      setPipeline('needs_manual');
    }
    setStatusMsg(result.message || 'Review the details before saving.');
  }

  function bumpSession(patch: (prev: MockSession) => MockSession) {
    setSession((prev) => {
      const next = patch(prev);
      writeSession(next);
      return next;
    });
  }

  async function acceptFile(f: File | undefined, source: 'camera' | 'file') {
    if (!f) return;
    const scanId = scanSession.current.begin();
    userTouched.current = { merchant: false, amount: false, date: false };
    setMerchant('');
    setAmount('');
    setDate('');
    setCurrency('USD');
    setPurchaseItems([]);
    setUncertain([]);
    setFieldHints({});
    setMatchId('');
    setServerStoragePath(null);
    setError('');
    setProviderLine('');
    setCaptureHint(
      source === 'camera'
        ? 'Use the camera, or choose a photo if this device opens the library instead.'
        : 'Choose a photo, screenshot, or PDF. A spreadsheet or other file is not read as a receipt.',
    );

    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });

    setPhase('reading');
    setPipeline('photo_attached');
    setStatusMsg('Photo attached');
    setFile(f);

    const draftId = uid();
    setPipeline('reading');
    setStatusMsg('Reading the receipt on this device…');

    let bundle: Awaited<ReturnType<typeof extractReceipt>>;
    try {
      bundle = await extractReceipt(f, {
        expenseId: draftId,
        preferBrowser: true,
        onProgress: (msg) => {
          if (!scanSession.current.isCurrent(scanId)) return;
          if (/^Photo attached/i.test(msg)) {
            setPipeline('photo_attached');
          } else if (/Reading the receipt|Preparing on-device|preparing/i.test(msg)) {
            setPipeline('reading');
          }
          setStatusMsg(msg);
        },
      });
    } catch {
      if (!scanSession.current.isCurrent(scanId)) return;
      const remote = await requestServerExtraction(f);
      if (!scanSession.current.isCurrent(scanId)) return;
      setFile(f);
      if (remote.ok) {
        setOcrProvider(remote.reading.provider);
        setExtractionVersion(remote.reading.version);
        setExtractionStatus(remote.reading.status);
        setProviderLine(remote.reused
          ? 'This photo was read again from the earlier result.'
          : 'A receipt service added details. Review them before saving.');
        setPurchaseItems(remote.reading.items || []);
        applyOcrToForm(remote.reading);
        setPhase('review');
        setPipeline(remote.reading.uncertainFields.length ? 'needs_manual' : 'details_filled');
        bumpSession((prev) => ({ ...prev, snaps: prev.snaps + 1, reviews: prev.reviews + 1 }));
        return;
      }
      setPhase('review');
      setPipeline('needs_manual');
      setExtractionStatus('failed');
      setProviderLine('');
      setUncertain(['merchant', 'date', 'total']);
      setError('');
      setStatusMsg(remote.skipped
        ? 'This photo could not be read on this device. Retry, choose another photo, or type the merchant, date, and amount.'
        : remote.message);
      return;
    }

    if (!scanSession.current.isCurrent(scanId)) {
      if (bundle.previewUrl) URL.revokeObjectURL(bundle.previewUrl);
      return;
    }
    const { extraction: result, attachFile, previewUrl: nextPreview } = bundle;

    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      if (nextPreview) return nextPreview;
      if (attachFile) return URL.createObjectURL(attachFile);
      return null;
    });

    // Keep receipt attached even when OCR fails / needs manual entry.
    setFile(attachFile || f);
    setOcrProvider(result.provider || null);
    setExtractionVersion(result.version || '');
    setServerStoragePath(result.storagePath || null);
    setExtractionStatus(
      result.status === 'ready' ||
        result.status === 'needs_details' ||
        result.status === 'failed' ||
        result.status === 'blocked'
        ? result.status
        : 'needs_details',
    );
    applyOcrToForm(result);
    setPhase('review');
    bumpSession((prev) => ({ ...prev, snaps: prev.snaps + 1, reviews: prev.reviews + 1 }));
    const filledLocal = Boolean(result.merchant || result.date || result.total != null);

    const remote = await requestServerExtraction(attachFile || f);
    if (!scanSession.current.isCurrent(scanId)) return;
    if (!remote.ok) {
      setProviderLine(filledLocal
        ? 'Reading ran on this device. Saving stores this photo in your private account.'
        : '');
      setStatusMsg(filledLocal
        ? (result.message || 'Review the details before saving.')
        : (result.message || 'This photo could not be read on this device. Retry, choose another photo, or type the merchant, date, and amount.'));
      setError('');
      return;
    }
    const merged = mergeReceiptReading({
      local: result,
      remote: remote.reading,
    });
    setOcrProvider(merged.provider || null);
    setExtractionVersion(merged.version || '');
    setExtractionStatus(merged.status);
    setProviderLine(
      remote.processed
        ? remote.reused
          ? 'This photo was read again from the earlier result.'
          : 'A receipt service added details. Review them before saving.'
        : remote.reading.mode === 'recorded'
          ? 'Saved test reading applied. This photo was not sent to the live receipt service.'
          : 'Reading ran on this device. Saving stores this photo in your private account.',
    );
    setPurchaseItems(merged.items || []);
    applyOcrToForm(merged);

    if (merged.merchant && merged.date && merged.total != null) {
      const hit = records.find(
        (r) =>
          r.merchant.toLowerCase() === merged.merchant!.toLowerCase() &&
          r.date === merged.date &&
          Math.abs(r.amount - merged.total!) < 0.005,
      );
      if (hit) setMatchId(hit.id);
    }
  }

  const suggestion = suggestWriteOff(
    {
      merchant,
      category: '',
      type: 'Unsorted',
      notes,
      items: purchaseItems,
      reviewed: false,
      treatmentSource: 'suggestion',
      percent: 0,
      eligibilityChecked: false,
    },
    profile,
    rules,
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (!merchant.trim()) throw new Error('Please enter a merchant.');
      if (!date) throw new Error('Please enter the transaction date.');
      const amountNum = Number(amount);
      if (!Number.isFinite(amountNum) || amountNum < 0.01) {
        throw new Error('Please enter a valid amount.');
      }

      const receiptMeta = {
        name: file?.name || 'receipt',
        storagePath: serverStoragePath || '',
        localPreviewUrl: previewUrl || undefined,
        mimeType: file?.type,
        sizeBytes: file?.size,
        extractionStatus:
          extractionStatus === 'none'
            ? uncertain.length
              ? ('needs_details' as const)
              : ('ready' as const)
            : extractionStatus === 'blocked'
              ? ('needs_details' as const)
              : extractionStatus,
        extractionVersion: extractionVersion || suggestion.ruleVersion,
      };

      if (matchId) {
        const existing = records.find((r) => r.id === matchId);
        if (!existing) throw new Error('Selected match was not found.');
        await saveRecord(
          {
            ...existing,
            notes: notes.trim() || existing.notes,
            receipt: {
              ...receiptMeta,
              storagePath: serverStoragePath || existing.receipt?.storagePath || '',
            },
          },
          serverStoragePath ? null : file,
        );
        draftSaved.current = true;
        clearReceiptDraft();
        void clearReceiptPhoto();
        setDraftOffer(null);
        showToast('Receipt attached to the matching expense.');
        const typed =
          userTouched.current.merchant || userTouched.current.date || userTouched.current.amount;
        bumpSession((prev) => ({
          ...prev,
          savesWithoutTyping: prev.savesWithoutTyping + (typed ? 0 : 1),
          fieldsLeftForReview: prev.fieldsLeftForReview + uncertain.length,
        }));
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
        notes: notes.trim() || purchaseItems.map((item) => item.name).join(', '),
        source: 'Receipt capture',
        treatmentSource: 'suggestion',
        // Eligible % is never set from OCR — stays 0 until the user reviews.
        percent: 0,
        eligibilityChecked: false,
        suggestedStatus: suggestion.status,
        suggestionReason: suggestion.reason,
        suggestionRuleId: suggestion.ruleId,
        suggestionRuleVersion: suggestion.ruleVersion,
        receipt: receiptMeta,
      });
      await saveRecord(record, serverStoragePath ? null : file);
      draftSaved.current = true;
      clearReceiptDraft();
      void clearReceiptPhoto();
      setDraftOffer(null);
      const typed =
        userTouched.current.merchant || userTouched.current.date || userTouched.current.amount;
      bumpSession((prev) => ({
        ...prev,
        savesWithoutTyping: prev.savesWithoutTyping + (typed ? 0 : 1),
        fieldsLeftForReview: prev.fieldsLeftForReview + uncertain.length,
      }));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  function closeReview() {
    if (phase === 'review' && !draftSaved.current && (merchant || amount || date)) {
      saveReceiptDraft({
        merchant,
        amount,
        date,
        currency,
        notes,
        updatedAt: new Date().toISOString(),
      });
      if (file) void saveReceiptPhoto(file, { name: file.name, type: file.type });
    }
    onClose();
  }

  useEffect(() => {
    if (!open) {
      startedFile.current = null;
      return;
    }
    if (!initialFile || startedFile.current === initialFile) return;
    startedFile.current = initialFile;
    void acceptFile(initialFile, 'file');
  }, [open, initialFile]);

  const browserMode = localPreview || ocrProvider === 'tesseract.js' || phase !== 'pick';

  const pipelineLabel =
    pipeline === 'photo_attached'
      ? 'Photo attached'
      : pipeline === 'reading'
        ? 'Reading the receipt on this device'
        : pipeline === 'details_filled'
          ? 'Details filled in'
          : pipeline === 'needs_manual'
            ? 'Finish manually'
            : null;

  return (
    <dialog
      id="snapReceiptdialog"
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        closeReview();
      }}
    >
      <form onSubmit={onSubmit}>
        <div className="panelhead">
          <h2>Snap a receipt</h2>
          <button type="button" className="edit" onClick={closeReview} aria-label="Close">
            ✕
          </button>
        </div>
        <p>Photograph or choose a receipt. No bank connection required.</p>
        {browserMode && phase === 'pick' && (
          <div className="notice" style={{ marginBottom: 12 }}>
            Reading runs on this device. Review the merchant, date, and amount before saving.
            Nothing is saved until you confirm.
          </div>
        )}

        {phase === 'pick' && draftOffer && (
          <div className="notice" style={{ marginBottom: 12 }}>
            Unsaved receipt details are still in this browser. They are not saved as an expense,
            and continuing does not send the photo again.
            <div className="inlinebuttons" style={{ marginTop: 10 }}>
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  void (async () => {
                    const photo = await loadReceiptPhoto();
                    setMerchant(draftOffer.merchant);
                    setAmount(draftOffer.amount);
                    setDate(draftOffer.date);
                    setCurrency(draftOffer.currency || 'USD');
                    setNotes(draftOffer.notes);
                    if (photo) {
                      setFile(photo);
                      setPreviewUrl((current) => {
                        if (current) URL.revokeObjectURL(current);
                        return URL.createObjectURL(photo);
                      });
                    }
                    userTouched.current = { merchant: true, amount: true, date: true };
                    setProviderLine(draftOffer.merchant || draftOffer.amount || draftOffer.date
                      ? 'Reading ran on this device. Saving stores this photo in your private account.'
                      : '');
                    setPhase('review');
                    setDraftOffer(null);
                  })();
                }}
              >
                Continue details
              </button>
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  clearReceiptDraft();
                  void clearReceiptPhoto();
                  setDraftOffer(null);
                }}
              >
                Discard details
              </button>
            </div>
          </div>
        )}

        {phase === 'pick' && (
          <div className="importbox">
            <div className="inlinebuttons" style={{ marginBottom: 12 }}>
              <button type="button" className="btn" onClick={() => cameraInputRef.current?.click()}>
                Take photo
              </button>
              <button type="button" className="btn secondary" onClick={() => libraryInputRef.current?.click()}>
                Choose photos or screenshots
              </button>
              <button type="button" className="btn secondary" onClick={() => fileInputRef.current?.click()}>
                Choose file
              </button>
            </div>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
              aria-label="Take photo"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                void acceptFile(f, 'camera');
              }}
            />
            <input
              ref={libraryInputRef}
              type="file"
              accept="image/*"
              style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
              aria-label="Choose photos or screenshots"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                void acceptFile(f, 'file');
              }}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf,.heic,.heif"
              style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
              aria-label="Choose receipt file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                void acceptFile(f, 'file');
              }}
            />
            <p className="formhint">
              JPEG, PNG, WebP, and PDF are supported. HEIC from an iPhone is read when this browser
              can open it. Reading runs on this device. Saving stores the photo in your private
              account, up to 3 MB, and removes it when you delete the expense or the account.
              {APPROVED_PLAN.label} does not turn on a separate receipt service in this preview.
              A cloud drive can appear in the file picker; it is optional.
              {localPreview
                ? ' In local preview, the file stays in this browser and does not sync.'
                : ''}
            </p>
          </div>
        )}

        {phase === 'reading' && (
          <div className="notice">
            {pipelineLabel && (
              <div className="formhint" style={{ marginBottom: 6 }}>
                <strong>{pipelineLabel}</strong>
              </div>
            )}
            {statusMsg || 'Working…'}
            {previewUrl && (
              <div style={{ marginTop: 10 }}>
                <img
                  src={previewUrl}
                  alt="Receipt preview"
                  style={{ maxWidth: '100%', maxHeight: 140, borderRadius: 8 }}
                />
              </div>
            )}
          </div>
        )}

        {phase === 'review' && (
          <>
            {pipelineLabel && (
              <div className="notice" style={{ marginBottom: 8 }}>
                <strong>{pipelineLabel}</strong>
                {file ? ` · ${file.name}` : ''}
              </div>
            )}
            {previewUrl && (
              <div className="notice" style={{ marginBottom: 12 }}>
                <div className="formhint" style={{ marginBottom: 8 }}>
                  Receipt attached
                </div>
                {file?.type.startsWith('image/') || /\.jpe?g$/i.test(file?.name || '') ? (
                  <img
                    src={previewUrl}
                    alt="Receipt preview"
                    style={{ maxWidth: '100%', maxHeight: 180, borderRadius: 8 }}
                  />
                ) : (
                  <span>{file?.name || 'Receipt file'}</span>
                )}
              </div>
            )}
            <div className={`notice ${uncertain.length ? 'warningnote' : ''}`}>
              {providerLine && <strong>{providerLine}</strong>}
              <div>{statusMsg || (merchant || amount || date
                ? 'Review the details before saving.'
                : 'This photo could not be read on this device. Retry, choose another photo, or type the merchant, date, and amount.')}</div>
            </div>
            {uncertain.length > 0 && (
              <p className="formhint">
                <strong>Needs review:</strong>{' '}
                {[
                  fieldHints.merchant,
                  fieldHints.total,
                  fieldHints.date,
                ]
                  .filter(Boolean)
                  .join(' · ') ||
                  uncertain.map((f) => (f === 'total' ? 'amount' : f)).join(', ')}
                .
              </p>
            )}
            {captureHint && <p className="formhint">{captureHint}</p>}
            {!merchant && !amount && !date && (
              <div className="inlinebuttons" style={{ marginBottom: 12 }}>
                <button type="button" className="btn secondary" onClick={() => file && void acceptFile(file, 'file')}>
                  Retry
                </button>
                <button type="button" className="btn secondary" onClick={() => { setPhase('pick'); setPipeline('idle'); }}>
                  Replace photo
                </button>
              </div>
            )}
            <div className="row">
              <label>
                Merchant
                {uncertain.includes('merchant') ? ' · Needs review' : ''}
                <input
                  required
                  maxLength={100}
                  value={merchant}
                  placeholder={
                    fieldHints.merchant ||
                    (uncertain.includes('merchant') ? 'Confirm the merchant name' : undefined)
                  }
                  onChange={(e) => {
                    markTouched('merchant');
                    setMerchant(e.target.value);
                  }}
                  style={uncertain.includes('merchant') ? { borderColor: '#c4a35a' } : undefined}
                />
              </label>
              <label>
                Amount
                {uncertain.includes('total') ? ' · Needs review' : ''}
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  required
                  value={amount}
                  placeholder={
                    fieldHints.total ||
                    (uncertain.includes('total') ? 'Confirm the final amount paid' : undefined)
                  }
                  onChange={(e) => {
                    markTouched('amount');
                    setAmount(e.target.value);
                  }}
                  style={uncertain.includes('total') ? { borderColor: '#c4a35a' } : undefined}
                />
              </label>
            </div>
            <div className="row">
              <label>
                Date
                {uncertain.includes('date') ? ' · Needs review' : ''}
                <input
                  type="date"
                  required
                  value={date}
                  aria-label={
                    fieldHints.date ||
                    (uncertain.includes('date') ? 'Confirm the purchase date' : 'Date')
                  }
                  onChange={(e) => {
                    markTouched('date');
                    setDate(e.target.value);
                  }}
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
              <div>{suggestion.reason}</div>
              {suggestion.question ? <div>{suggestion.question}</div> : null}
              <div className="ruleline">
                {suggestion.category}. Eligible % is set when you review.
              </div>
              {purchaseItems.length > 0 && (
                <div className="helper">Items: {purchaseItems.map((item) => item.name).join(', ')}</div>
              )}
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
            <div className="inlinebuttons">
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  scanSession.current.invalidate();
                  setPhase('pick');
                  setPipeline('idle');
                  setStatusMsg('');
                  setCaptureHint('');
                }}
              >
                Replace photo
              </button>
            </div>
          </>
        )}

        {error && (
          <div className="formerror" role="alert">
            {error}
          </div>
        )}
        <div className="dialogactions">
          <button type="button" className="btn secondary" onClick={closeReview}>
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
