import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import Modal from './Modal';
import { membersAPI, membershipPlansAPI, tenantSettingsAPI } from '../services/api';
import { FIELD_TYPE_LABEL } from '../utils/memberFields';
import {
  BUILTIN_FIELDS, REQUIRED_FIELDS, MAX_ROWS, autoMapTargets, buildRow, customKeyOf, customTarget, downloadSampleSheet,
  guessDuration, repeatedInFile, sampleValues, showCell, suggestType, toPayload, unmatchedPlans,
} from '../utils/bulkImport';

const inputClass = 'border rounded px-2 py-1 dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100';
const primaryBtn = 'bg-gray-900 text-white rounded px-4 py-2 dark:bg-accent dark:text-accent-ink dark:font-semibold dark:hover:bg-accent-hover disabled:opacity-50';
const ghostBtn = 'border rounded px-4 py-2 dark:border-gray-600 dark:text-gray-100';
const DURATIONS = [['monthly', 'Monthly'], ['quarterly', 'Quarterly'], ['half_yearly', 'Half-yearly'], ['yearly', 'Yearly']];
const NEW_FIELD = '__new__';
const errorMessage = (err) => err?.response?.data?.message || err?.message || 'Something went wrong. Please try again.';

// A cell starting with = + - @ (or a tab/CR) would run as a formula when the file is opened in
// Excel or Sheets; a leading apostrophe makes it plain text. Phone numbers may legitimately start with +.
const safeCell = (v) => { const s = String(v); return /^[=+\-@\t\r]/.test(s) && !/^\+?[0-9][0-9\s\-()]*$/.test(s) ? `'${s}` : s; };
const toCsv = (rows) => {
  const header = 'row,name,phone,email,error\n';
  const body = rows.map((r) => [r.row + 1, r.name || '', r.phone || '', r.email || '', r.error].map((v) => `"${safeCell(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  return header + body;
};

// fixedBranchId: a branch-manager has one branch, so the selector is skipped and the batch is
// locked to it. canCreate: only the gym owner may add plans and fields, so for anyone else the
// "create" options are replaced by a note to ask the owner.
export default function BulkUploadMembersModal({
  open, onClose, branches, plans, onImported, fixedBranchId,
  memberFields = [], onFieldsChanged = () => {}, onPlanCreated = () => {}, canCreate = false,
}) {
  const [step, setStep] = useState('upload'); // upload -> map -> result
  const [branchId, setBranchId] = useState(fixedBranchId || '');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState([]);
  const [rawRows, setRawRows] = useState([]);
  const [targets, setTargets] = useState([]); // one per file column: '' | builtin key | 'cf:<key>'
  const [fieldDraft, setFieldDraft] = useState(null); // { col, label, type, busy, error }
  const [planDrafts, setPlanDrafts] = useState({}); // lower-cased plan name -> { durationUnit, price, busy, error }
  const [batchPlanId, setBatchPlanId] = useState('');
  const [importWithoutPlan, setImportWithoutPlan] = useState(false);
  const [existing, setExisting] = useState({ rows: new Map(), failed: false }); // row index -> name of the member who has that phone
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [importError, setImportError] = useState('');
  const [result, setResult] = useState(null);
  const [parseError, setParseError] = useState('');

  const reset = () => {
    setStep('upload'); setFileName(''); setHeaders([]); setRawRows([]); setTargets([]); setFieldDraft(null);
    setPlanDrafts({}); setBatchPlanId(''); setImportWithoutPlan(false); setExisting({ rows: new Map(), failed: false });
    setSkipDuplicates(true); setResult(null); setParseError(''); setImportError('');
  };
  const handleClose = () => { reset(); setBranchId(fixedBranchId || ''); onClose(); };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError('');
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const workbook = XLSX.read(buf, { type: 'array', cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const asRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (asRows.length < 2) throw new Error('File has no data rows below the header.');
      const [headerRow, ...dataRows] = asRows;
      const rows = dataRows.filter((r) => r.some((cell) => String(cell).trim() !== ''));
      setHeaders(headerRow);
      setRawRows(rows);
      setTargets(autoMapTargets(headerRow, memberFields));
      setStep('map');
    } catch (err) {
      setParseError(err.message || 'Could not read that file.');
    }
  };

  const rows = useMemo(
    () => rawRows.map((r) => buildRow(r, targets, { plans, batchPlanId, fields: memberFields })),
    [rawRows, targets, plans, batchPlanId, memberFields],
  );
  const missingRequired = REQUIRED_FIELDS.filter((f) => !targets.includes(f.key));
  const phoneMapped = targets.includes('phone');
  const unmatched = useMemo(() => (targets.includes('membershipPlanName') ? unmatchedPlans(rows, plans) : []), [rows, plans, targets]);
  const repeats = useMemo(() => repeatedInFile(rows), [rows]);
  const incomplete = useMemo(() => rows.reduce((n, r) => n + (!r.name || !r.phone ? 1 : 0), 0), [rows]);

  // Which rows already belong to a member of this gym, asked of the server (debounced: the
  // mapping can change many times while someone is choosing columns).
  const phoneSignature = phoneMapped ? rows.map((r) => r.phone).join('|') : '';
  useEffect(() => {
    if (step !== 'map' || !phoneMapped || rows.length === 0 || rows.length > MAX_ROWS) {
      setExisting({ rows: new Map(), failed: false });
      return undefined;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      membersAPI.bulkCheck({ branchId, phones: rows.map((r) => r.phone) })
        .then((res) => { if (!cancelled) setExisting({ rows: new Map(res.data.existing.map((d) => [d.row, d.memberName])), failed: false }); })
        .catch(() => { if (!cancelled) setExisting({ rows: new Map(), failed: true }); });
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [step, phoneSignature]); // eslint-disable-line react-hooks/exhaustive-deps

  const duplicateRows = useMemo(() => {
    const flagged = new Map();
    existing.rows.forEach((name, i) => flagged.set(i, `already ${name}`));
    repeats.forEach((first, i) => { if (!flagged.has(i)) flagged.set(i, `same phone as row ${first + 1}`); });
    return flagged;
  }, [existing, repeats]);

  // ----- columns -----
  const setTarget = (col, value) => {
    if (value === NEW_FIELD) {
      setFieldDraft({ col, label: String(headers[col] || '').trim(), type: suggestType(rawRows, col), busy: false, error: '' });
      return;
    }
    if (fieldDraft?.col === col) setFieldDraft(null);
    setTargets((prev) => prev.map((t, i) => (i === col ? value : t)));
  };
  const usedElsewhere = (col, value) => targets.some((t, i) => i !== col && t === value);

  const createField = async () => {
    const draft = fieldDraft;
    if (!draft.label.trim()) { setFieldDraft({ ...draft, error: 'Give the field a name.' }); return; }
    setFieldDraft({ ...draft, busy: true, error: '' });
    try {
      const { data } = await tenantSettingsAPI.createMemberField({ label: draft.label.trim(), type: draft.type });
      onFieldsChanged([...memberFields, data]);
      setTargets((prev) => prev.map((t, i) => (i === draft.col ? customTarget(data.key) : t)));
      setFieldDraft(null);
    } catch (err) {
      setFieldDraft({ ...draft, busy: false, error: errorMessage(err) });
    }
  };

  // ----- plans -----
  const draftFor = (name) => planDrafts[name.toLowerCase()] || { durationUnit: guessDuration(name), price: '', busy: false, error: '' };
  const setDraft = (name, patch) => setPlanDrafts((prev) => ({ ...prev, [name.toLowerCase()]: { ...draftFor(name), ...patch } }));
  const createPlan = async (name) => {
    const d = draftFor(name);
    if (d.price === '' || Number(d.price) < 0 || Number.isNaN(Number(d.price))) { setDraft(name, { error: 'Enter the price.' }); return; }
    setDraft(name, { busy: true, error: '' });
    try {
      const { data } = await membershipPlansAPI.create({ name, durationUnit: d.durationUnit, price: Number(d.price) });
      onPlanCreated(data);
    } catch (err) {
      setDraft(name, { busy: false, error: errorMessage(err) });
    }
  };

  const tooMany = rows.length > MAX_ROWS;
  const planBlocked = unmatched.length > 0 && !batchPlanId && !importWithoutPlan;
  const skipped = skipDuplicates ? duplicateRows.size : 0;
  const willImport = Math.max(0, rows.length - skipped - incomplete);
  const canImport = !submitting && missingRequired.length === 0 && !tooMany && !planBlocked && !fieldDraft && willImport > 0;

  const handleImport = async () => {
    setSubmitting(true);
    setImportError('');
    try {
      const { data } = await membersAPI.bulkCreate({ branchId, members: rows.map(toPayload), skipDuplicatePhones: skipDuplicates });
      setResult(data);
      setStep('result');
      onImported();
    } catch (err) {
      setImportError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const downloadFailedCsv = () => {
    const failed = result.results.filter((r) => !r.success);
    const blob = new Blob([toCsv(failed)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'failed-rows.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const targetLabel = (t) => {
    if (!t) return null;
    const key = customKeyOf(t);
    return key ? memberFields.find((f) => f.key === key)?.label : BUILTIN_FIELDS.find((f) => f.key === t)?.label;
  };
  const previewCols = headers.map((h, i) => i);
  const previewRows = rawRows.slice(0, 5);

  return (
    <Modal open={open} onClose={handleClose} title="Bulk Upload Members" wide={step === 'map'}>
      {step === 'upload' && (
        <div className="flex flex-col gap-3">
          {!fixedBranchId && (
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Branch (applies to every row in the file)</label>
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={`${inputClass} w-full`}>
                <option value="" disabled>Select branch</option>
                {branches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">CSV or Excel file (.csv, .xlsx, .xls)</label>
            <input type="file" accept=".csv,.xlsx,.xls" disabled={!branchId} onChange={handleFile} className={`${inputClass} w-full`} />
            {!branchId && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Select a branch first.</p>}
          </div>
          {parseError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{parseError}</p>}
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Export your Google Sheet as .xlsx or .csv (File → Download), then upload it here. On the next screen every
            column of your file is listed as it is, and you choose what each one becomes. {canCreate && 'Columns with no matching field can become new fields. '}
            Up to {MAX_ROWS} rows per upload.
          </p>
          <button type="button" onClick={() => downloadSampleSheet({ plans, fields: memberFields })} className="text-sm text-blue-600 dark:text-blue-400 hover:underline self-start">
            Download a sample sheet
          </button>
          <div className="flex justify-end pt-2">
            <button type="button" onClick={handleClose} className={ghostBtn}>Cancel</button>
          </div>
        </div>
      )}

      {step === 'map' && (
        <div className="flex flex-col gap-5">
          <p className="text-sm text-gray-500 dark:text-gray-400">{fileName} — {rawRows.length} row(s), {headers.length} column(s).</p>

          {/* Column-first: the file's columns exactly as they are, each with a choice. */}
          <section aria-label="Match your columns">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">1. Match your columns</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Each column of your file is listed in order. Pick what it should become, or leave it out.</p>
            <ul className="divide-y divide-gray-200 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded">
              {headers.map((h, col) => {
                const samples = sampleValues(rawRows, col);
                const draft = fieldDraft?.col === col ? fieldDraft : null;
                const hasData = samples.length > 0;
                return (
                  <li key={col} className="p-3 space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_15rem] gap-2 sm:items-center">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{String(h).trim() || `Column ${col + 1}`}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{hasData ? samples.map(showCell).join(' · ') : 'empty'}</div>
                      </div>
                      <select
                        aria-label={`What column ${String(h).trim() || col + 1} becomes`}
                        value={draft ? NEW_FIELD : targets[col]}
                        onChange={(e) => setTarget(col, e.target.value)}
                        className={`${inputClass} w-full`}
                      >
                        <option value="">— Don't import —</option>
                        <optgroup label="Member details">
                          {BUILTIN_FIELDS.map((f) => (
                            <option key={f.key} value={f.key} disabled={usedElsewhere(col, f.key)}>{f.label}{f.required ? ' *' : ''}</option>
                          ))}
                        </optgroup>
                        {memberFields.length > 0 && (
                          <optgroup label="Your own fields">
                            {memberFields.map((f) => (
                              <option key={f.key} value={customTarget(f.key)} disabled={usedElsewhere(col, customTarget(f.key))}>{f.label}</option>
                            ))}
                          </optgroup>
                        )}
                        {canCreate && <option value={NEW_FIELD}>+ Create new field…</option>}
                      </select>
                    </div>
                    {!targets[col] && !draft && hasData && !canCreate && (
                      <p className="text-xs text-gray-400 dark:text-gray-500">Not imported. Ask the gym owner to add a field if you need this column.</p>
                    )}
                    {draft && (
                      <div className="rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-3 space-y-2">
                        <div className="text-xs font-medium text-gray-700 dark:text-gray-200">New field for every member</div>
                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_9rem] gap-2">
                          <input aria-label="New field name" maxLength={40} value={draft.label} onChange={(e) => setFieldDraft({ ...draft, label: e.target.value })} placeholder="Field name" className={`${inputClass} w-full`} />
                          <select aria-label="New field type" value={draft.type} onChange={(e) => setFieldDraft({ ...draft, type: e.target.value })} className={`${inputClass} w-full`}>
                            {Object.entries(FIELD_TYPE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                          </select>
                        </div>
                        {draft.error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{draft.error}</p>}
                        <div className="flex gap-2">
                          <button type="button" onClick={createField} disabled={draft.busy} className={`${primaryBtn} text-sm py-1`}>{draft.busy ? 'Creating...' : 'Create field'}</button>
                          <button type="button" onClick={() => setFieldDraft(null)} className={`${ghostBtn} text-sm py-1`}>Cancel</button>
                        </div>
                        <p className="text-xs text-gray-400 dark:text-gray-500">It is added to your gym's member fields, so it also appears when adding or editing a member, and as a column you can show in the member list.</p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {missingRequired.length > 0 && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400 mt-2">
                Still needed: {missingRequired.map((f) => f.label).join(', ')}
              </p>
            )}
          </section>

          {/* Plans named in the file */}
          {targets.includes('membershipPlanName') && (
            <section aria-label="Plans">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">2. Plans</h3>
              {unmatched.length === 0 ? (
                <p className="text-xs text-green-700 dark:text-green-400">Every plan in your file matches one of your plans.</p>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    These plans are in your file but not in your gym.{canCreate ? ' Create them here, with a length and price.' : ' Ask the gym owner to create them, or import those members without a plan.'}
                  </p>
                  <ul className="space-y-2">
                    {unmatched.map((u) => {
                      const d = draftFor(u.name);
                      return (
                        <li key={u.name} className="rounded border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-2">
                          <div className="text-sm text-gray-900 dark:text-gray-100"><span className="font-medium">{u.name}</span> <span className="text-xs text-gray-500 dark:text-gray-400">· {u.count} member{u.count === 1 ? '' : 's'}</span></div>
                          {canCreate && (
                            <div className="flex flex-wrap gap-2 items-center">
                              <select aria-label={`Length of ${u.name}`} value={d.durationUnit} onChange={(e) => setDraft(u.name, { durationUnit: e.target.value })} className={inputClass}>
                                {DURATIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                              </select>
                              <input aria-label={`Price of ${u.name}`} type="number" min="0" placeholder="Price ₹" value={d.price} onChange={(e) => setDraft(u.name, { price: e.target.value })} className={`${inputClass} w-28`} />
                              <button type="button" onClick={() => createPlan(u.name)} disabled={d.busy} className={`${primaryBtn} text-sm py-1`}>{d.busy ? 'Creating...' : 'Create plan'}</button>
                            </div>
                          )}
                          {d.error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{d.error}</p>}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              <div className="mt-3">
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Plan for rows with no plan of their own (optional)</label>
                <select value={batchPlanId} onChange={(e) => setBatchPlanId(e.target.value)} className={`${inputClass} w-full sm:w-1/2`}>
                  <option value="">— None —</option>
                  {plans.map((p) => <option key={p._id} value={p._id}>{p.name} (₹{p.price})</option>)}
                </select>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Every member who ends up with a plan gets a cash payment recorded at the plan's price, the same as adding a member one at a time.
                </p>
              </div>
              {unmatched.length > 0 && !batchPlanId && (
                <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-200 mt-2">
                  <input type="checkbox" checked={importWithoutPlan} onChange={(e) => setImportWithoutPlan(e.target.checked)} className="mt-1" />
                  Import the {unmatched.reduce((n, u) => n + u.count, 0)} row(s) with these plans without any plan (no payment recorded)
                </label>
              )}
            </section>
          )}

          {/* Checks before anything is written */}
          <section aria-label="Checks">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">{targets.includes('membershipPlanName') ? '3' : '2'}. Check</h3>
            <ul className="text-xs space-y-1">
              {incomplete > 0 && <li className="text-amber-700 dark:text-amber-400">{incomplete} row(s) are missing a name or phone and will be skipped.</li>}
              {duplicateRows.size > 0 && (
                <li className="text-amber-700 dark:text-amber-400">
                  {existing.rows.size > 0 && <>{existing.rows.size} row(s) have a phone number that already belongs to a member of your gym. </>}
                  {repeats.size > 0 && <>{repeats.size} row(s) repeat a phone number from earlier in this file.</>}
                </li>
              )}
              {existing.failed && <li className="text-gray-500 dark:text-gray-400">Could not check your existing members for duplicates. The import still skips them if you leave the box below ticked.</li>}
              {tooMany && <li role="alert" className="text-red-600 dark:text-red-400">This file has {rows.length} rows; the limit is {MAX_ROWS} per upload. Split it into smaller files.</li>}
              {incomplete === 0 && duplicateRows.size === 0 && !tooMany && phoneMapped && <li className="text-green-700 dark:text-green-400">No problems found.</li>}
            </ul>
            {(duplicateRows.size > 0 || existing.failed) && (
              <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-200 mt-2">
                <input type="checkbox" checked={skipDuplicates} onChange={(e) => setSkipDuplicates(e.target.checked)} className="mt-1" />
                Skip rows whose phone number is already in my gym or repeats in this file (recommended)
              </label>
            )}
          </section>

          {/* Preview: the file's own columns, in its own order */}
          <section aria-label="Preview">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Preview (first {previewRows.length} of {rawRows.length} rows). Greyed columns are not imported.</p>
            <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded">
              <table className="w-full text-xs text-left">
                <thead className="bg-gray-50 dark:bg-gray-900/40 text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="px-2 py-1 font-medium">#</th>
                    {previewCols.map((c) => (
                      <th key={c} className={`px-2 py-1 font-medium whitespace-nowrap ${targets[c] ? '' : 'opacity-50'}`}>
                        <div>{String(headers[c]).trim() || `Column ${c + 1}`}</div>
                        <div className="font-normal text-[11px]">{targets[c] ? `→ ${targetLabel(targets[c])}` : 'not imported'}</div>
                      </th>
                    ))}
                    <th className="px-2 py-1 font-medium">Note</th>
                  </tr>
                </thead>
                <tbody className="text-gray-700 dark:text-gray-200">
                  {previewRows.map((raw, i) => {
                    const row = rows[i];
                    const note = !row.name || !row.phone ? 'Missing name or phone' : skipDuplicates && duplicateRows.has(i) ? `Skipped: ${duplicateRows.get(i)}` : '';
                    return (
                      <tr key={i} className="border-t border-gray-200 dark:border-gray-700">
                        <td className="px-2 py-1 text-gray-400">{i + 1}</td>
                        {previewCols.map((c) => <td key={c} className={`px-2 py-1 whitespace-nowrap ${targets[c] ? '' : 'opacity-40'}`}>{showCell(raw[c]) || '—'}</td>)}
                        <td className="px-2 py-1 text-amber-700 dark:text-amber-400 whitespace-nowrap">{note}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {importError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{importError}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={handleImport} disabled={!canImport} className={primaryBtn}>
              {submitting ? 'Importing...' : `Import ${willImport} Member${willImport === 1 ? '' : 's'}`}
            </button>
            <button type="button" onClick={reset} className={ghostBtn}>Back</button>
            {planBlocked && <span className="text-xs text-amber-700 dark:text-amber-400">Create the plans above, or tick the box to import without them.</span>}
            {fieldDraft && <span className="text-xs text-amber-700 dark:text-amber-400">Finish or cancel the new field first.</span>}
          </div>
        </div>
      )}

      {step === 'result' && result && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-gray-700 dark:text-gray-200">
            <span className="text-green-600 dark:text-green-400 font-medium">{result.succeeded} imported</span>
            {result.failed > 0 && <> · <span className="text-red-600 dark:text-red-400 font-medium">{result.failed} not imported</span></>}
            {result.paymentsRecorded > 0 && <> · {result.paymentsRecorded} payment{result.paymentsRecorded === 1 ? '' : 's'} recorded</>}
          </p>
          {result.failed > 0 && (
            <>
              <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded max-h-56 overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-gray-50 dark:bg-gray-900/40 text-gray-500 dark:text-gray-400">
                    <tr><th className="px-2 py-1">Row</th><th className="px-2 py-1">Name</th><th className="px-2 py-1">Reason</th></tr>
                  </thead>
                  <tbody className="text-gray-700 dark:text-gray-200">
                    {result.results.filter((r) => !r.success).map((r) => (
                      <tr key={r.row} className="border-t border-gray-200 dark:border-gray-700">
                        <td className="px-2 py-1">{r.row + 1}</td>
                        <td className="px-2 py-1">{r.name || '—'}</td>
                        <td className="px-2 py-1">{r.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button onClick={downloadFailedCsv} className="text-sm text-blue-600 dark:text-blue-400 hover:underline self-start">
                Download these rows as CSV
              </button>
            </>
          )}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={handleClose} className={primaryBtn}>Done</button>
            <button type="button" onClick={reset} className={ghostBtn}>Upload Another File</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
