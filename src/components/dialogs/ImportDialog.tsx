import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  categoryFor,
  fingerprint,
  money,
  parseAmount,
  parseCSV,
  parseDate,
  uid,
} from '../../lib/core';
import type { ExpenseRecord } from '../../lib/types';
import { useWorkspace } from '../../context/WorkspaceContext';
import { importExpenses } from '../../lib/data';
import { useAuth } from '../../context/AuthContext';

type Counts = { invalid: number; other: number; duplicate: number; ready: number };

export function ImportDialog({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => void }) {
  const { records, refresh, showToast } = useWorkspace();
  const { user } = useAuth();
  const ref = useRef<HTMLDialogElement>(null);
  const [rawImport, setRawImport] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapDate, setMapDate] = useState(0);
  const [mapMerchant, setMapMerchant] = useState(0);
  const [mapAmount, setMapAmount] = useState(0);
  const [sign, setSign] = useState<'positive' | 'negative'>('positive');
  const [account, setAccount] = useState('');
  const [mappingVisible, setMappingVisible] = useState(false);
  const [previewRows, setPreviewRows] = useState<{ date: string; merchant: string; amount: string; result: string }[]>([]);
  const [summary, setSummary] = useState('');
  const [candidates, setCandidates] = useState<ExpenseRecord[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      setRawImport([]);
      setHeaders([]);
      setMappingVisible(false);
      setPreviewRows([]);
      setSummary('');
      setCandidates([]);
      setError('');
      setAccount('');
      setSign('positive');
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  function rebuildPreview(
    rows: string[][],
    dIdx: number,
    mIdx: number,
    aIdx: number,
    expenseSign: 'positive' | 'negative',
    accountLabel: string,
  ) {
    if (new Set([dIdx, mIdx, aIdx]).size !== 3) {
      setError('Choose a different column for date, merchant, and amount.');
      setCandidates([]);
      return;
    }
    const seen = new Set(records.map((r) => fingerprint(r)));
    const counts: Counts = { invalid: 0, other: 0, duplicate: 0, ready: 0 };
    const nextCandidates: ExpenseRecord[] = [];
    const preview = rows.map((row) => {
      const date = parseDate(row[dIdx]);
      const merchant = String(row[mIdx] || '').trim();
      const signed = parseAmount(row[aIdx]);
      const amount = Math.abs(signed);
      let result: string;
      const base = { date: date || '', merchant, amount, account: accountLabel };
      if (!date || !merchant || !Number.isFinite(signed) || amount > 999999999) {
        result = 'Invalid row';
        counts.invalid++;
      } else if (signed === 0 || (expenseSign === 'positive' ? signed < 0 : signed > 0)) {
        result = 'Other sign / zero · skipped';
        counts.other++;
      } else if (seen.has(fingerprint(base))) {
        result = 'Possible duplicate · skipped';
        counts.duplicate++;
      } else {
        seen.add(fingerprint(base));
        result = 'Ready for review';
        counts.ready++;
        nextCandidates.push({
          ...base,
          id: uid(),
          category: categoryFor(merchant),
          type: 'Unsorted',
          share: 0,
          percent: 0,
          eligibilityChecked: false,
          reviewed: false,
          source: 'CSV import',
          notes: '',
          entity: '',
          receipt: null,
        });
      }
      return {
        date: date || String(row[dIdx] || ''),
        merchant,
        amount: Number.isFinite(signed) ? money(signed) : 'Invalid',
        result,
      };
    });
    setPreviewRows(preview.slice(0, 30));
    setSummary(
      `${counts.ready} ready · ${counts.duplicate} possible duplicates skipped · ${counts.other} other-sign / zero rows skipped · ${counts.invalid} invalid rows. ${
        preview.length > 30 ? 'Preview shows the first 30 rows. ' : ''
      }Same date, merchant, amount and account are treated as possible duplicates; add legitimate repeat purchases manually.`,
    );
    setCandidates(nextCandidates);
    setError('');
  }

  async function onFile(file: File | undefined) {
    try {
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) throw new Error('Please choose a CSV smaller than 2 MB.');
      const csvRows = parseCSV(await file.text());
      if (csvRows.length < 2) throw new Error('Include a header row and at least one transaction.');
      const hdrs = csvRows[0].map((x, i) => x.trim() || `Column ${i + 1}`);
      const body = csvRows.slice(1);
      const find = (rx: RegExp) => Math.max(0, hdrs.findIndex((x) => rx.test(x)));
      const d = find(/date/i);
      const m = find(/merchant|description|name|payee/i);
      const a = find(/^amount$|transaction amount|debit/i);
      setHeaders(hdrs);
      setRawImport(body);
      setMapDate(d);
      setMapMerchant(m);
      setMapAmount(a);
      setMappingVisible(true);
      rebuildPreview(body, d, m, a, sign, account);
    } catch (err) {
      setMappingVisible(false);
      setError(err instanceof Error ? err.message : 'Could not read CSV.');
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user || !candidates.length) return;
    setBusy(true);
    try {
      const n = await importExpenses(user.id, candidates);
      await refresh();
      showToast(`${n} expenses imported for review.`);
      onImported();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      id="importdialog"
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <form id="importform" onSubmit={onSubmit}>
        <div className="panelhead">
          <h2>Bring your expenses in.</h2>
          <button type="button" className="edit" onClick={onClose} aria-label="Close import">
            ✕
          </button>
        </div>
        <p>Upload a bank or card CSV. Preview it before anything is saved.</p>
        <div className="importbox">
          <label>
            CSV statement
            <input
              type="file"
              id="csvfile"
              accept=".csv,text/csv"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
          </label>
          <p className="formhint">Processed in your browser. Up to 2 MB / 2,000 rows. USD only.</p>
        </div>
        {mappingVisible && (
          <div id="mapping">
            <div className="mapping">
              <label>
                Date column
                <select
                  id="mapdate"
                  value={mapDate}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setMapDate(v);
                    rebuildPreview(rawImport, v, mapMerchant, mapAmount, sign, account);
                  }}
                >
                  {headers.map((h, i) => (
                    <option key={h + i} value={i}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Merchant / description column
                <select
                  id="mapmerchant"
                  value={mapMerchant}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setMapMerchant(v);
                    rebuildPreview(rawImport, mapDate, v, mapAmount, sign, account);
                  }}
                >
                  {headers.map((h, i) => (
                    <option key={h + i} value={i}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Amount column
                <select
                  id="mapamount"
                  value={mapAmount}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setMapAmount(v);
                    rebuildPreview(rawImport, mapDate, mapMerchant, v, sign, account);
                  }}
                >
                  {headers.map((h, i) => (
                    <option key={h + i} value={i}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Expense sign
                <select
                  id="sign"
                  value={sign}
                  onChange={(e) => {
                    const v = e.target.value as 'positive' | 'negative';
                    setSign(v);
                    rebuildPreview(rawImport, mapDate, mapMerchant, mapAmount, v, account);
                  }}
                >
                  <option value="positive">Positive amounts are expenses</option>
                  <option value="negative">Negative amounts are expenses</option>
                </select>
              </label>
            </div>
            <label style={{ marginTop: 12 }}>
              Account label (optional)
              <input
                id="importaccount"
                maxLength={80}
                placeholder="e.g. Business card ••1234"
                value={account}
                onChange={(e) => {
                  setAccount(e.target.value);
                  rebuildPreview(rawImport, mapDate, mapMerchant, mapAmount, sign, e.target.value);
                }}
              />
            </label>
            <p className="formhint">
              Other-sign amounts and zero amounts are skipped, not treated as expenses. Payments and
              transfers need your review.
            </p>
            <div className="scrolltable">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Merchant</th>
                    <th>Amount</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody id="importpreview">
                  {previewRows.map((r, i) => (
                    <tr key={i}>
                      <td>{r.date}</td>
                      <td>{r.merchant}</td>
                      <td>{r.amount}</td>
                      <td>{r.result}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="notice" id="importsummary">
              {summary}
            </div>
          </div>
        )}
        {error && (
          <div className="formerror" id="importerror" role="alert">
            {error}
          </div>
        )}
        <div className="dialogactions">
          <button type="button" className="btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn" id="importsave" disabled={!candidates.length || busy}>
            {busy ? 'Importing…' : 'Import to review'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
