import { useState } from 'react';
import * as XLSX from 'xlsx';
import Modal from './Modal';
import { membersAPI } from '../services/api';

const FIELD_DEFS = [
  { key: 'name', label: 'Name', required: true, aliases: ['name', 'full name', 'member name', 'customer name'] },
  { key: 'phone', label: 'Phone', required: true, aliases: ['phone', 'phone number', 'mobile', 'mobile number', 'contact', 'contact number'] },
  { key: 'email', label: 'Email', required: false, aliases: ['email', 'email address', 'e-mail'] },
  { key: 'dob', label: 'Date of Birth', required: false, aliases: ['dob', 'date of birth', 'birthday', 'birth date'] },
  { key: 'gender', label: 'Gender', required: false, aliases: ['gender', 'sex'] },
  { key: 'membershipPlanName', label: 'Membership Plan', required: false, aliases: ['plan', 'membership plan', 'package', 'plan name'] },
  { key: 'membershipStart', label: 'Start Date', required: false, aliases: ['start date', 'membership start', 'join date', 'joining date', 'start'] },
];

const GENDER_MAP = {
  m: 'male', male: 'male', f: 'female', female: 'female', other: 'other', o: 'other',
  'prefer not to say': 'prefer_not_say', 'prefer_not_say': 'prefer_not_say',
};

const inputClass = 'border rounded px-2 py-1 dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100';

const normalizeHeader = (h) => String(h || '').trim().toLowerCase();

const autoMap = (headers) => {
  const mapping = {};
  const claimed = new Set();
  const normHeaders = headers.map(normalizeHeader);
  FIELD_DEFS.forEach((field) => {
    let idx = normHeaders.findIndex((h, i) => !claimed.has(i) && field.aliases.includes(h));
    if (idx === -1) {
      idx = normHeaders.findIndex((h, i) => !claimed.has(i) && field.aliases.some((a) => h.includes(a)));
    }
    if (idx !== -1) { mapping[field.key] = idx; claimed.add(idx); }
  });
  return mapping;
};

const normalizeDate = (value) => {
  if (!value) return undefined;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
};

// batchPlanId is the fallback for the common "this whole sheet is one plan" case — a
// row's own Plan column wins when it matches an existing plan by name; otherwise (blank,
// or a name that doesn't match anything, e.g. a typo) it falls back to the batch plan
// rather than silently importing with no plan at all.
const buildRow = (rawRow, mapping, plans, batchPlanId) => {
  const get = (key) => (mapping[key] != null ? rawRow[mapping[key]] : undefined);
  const genderRaw = get('gender');
  const planNameRaw = get('membershipPlanName');
  const rowPlan = planNameRaw
    ? plans.find((p) => p.name.trim().toLowerCase() === String(planNameRaw).trim().toLowerCase())
    : null;
  const plan = rowPlan || (batchPlanId ? plans.find((p) => p._id === batchPlanId) : null);
  return {
    name: get('name') ? String(get('name')).trim() : '',
    phone: get('phone') ? String(get('phone')).trim() : '',
    email: get('email') ? String(get('email')).trim() : undefined,
    dob: normalizeDate(get('dob')),
    gender: genderRaw ? GENDER_MAP[String(genderRaw).trim().toLowerCase()] : undefined,
    membershipPlanId: plan?._id,
    membershipStart: normalizeDate(get('membershipStart')),
  };
};

const toCsv = (rows) => {
  const header = 'row,name,phone,email,error\n';
  const body = rows.map((r) => [r.row + 1, r.name || '', r.phone || '', r.email || '', r.error].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  return header + body;
};

// fixedBranchId: branch-manager isn't picking a branch (they only have one) — skip the
// selector entirely and lock the batch to their own branch. Unset for tenant-admin, who
// still picks one via the dropdown below.
export default function BulkUploadMembersModal({ open, onClose, branches, plans, onImported, fixedBranchId }) {
  const [step, setStep] = useState('upload'); // upload -> map -> result
  const [branchId, setBranchId] = useState(fixedBranchId || '');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState([]);
  const [rawRows, setRawRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [batchPlanId, setBatchPlanId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [parseError, setParseError] = useState('');

  const reset = () => {
    setStep('upload'); setFileName(''); setHeaders([]); setRawRows([]);
    setMapping({}); setBatchPlanId(''); setResult(null); setParseError('');
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
      const nonEmptyRows = dataRows.filter((r) => r.some((cell) => String(cell).trim() !== ''));
      setHeaders(headerRow);
      setRawRows(nonEmptyRows);
      setMapping(autoMap(headerRow));
      setStep('map');
    } catch (err) {
      setParseError(err.message || 'Could not read that file.');
    }
  };

  const previewRows = rawRows.slice(0, 5).map((r) => buildRow(r, mapping, plans, batchPlanId));
  const missingRequired = FIELD_DEFS.filter((f) => f.required && mapping[f.key] == null);

  const handleImport = async () => {
    setSubmitting(true);
    try {
      const members = rawRows.map((r) => buildRow(r, mapping, plans, batchPlanId));
      const { data } = await membersAPI.bulkCreate({ branchId, members });
      setResult(data);
      setStep('result');
      onImported();
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

  return (
    <Modal open={open} onClose={handleClose} title="Bulk Upload Members">
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
          {parseError && <p className="text-sm text-red-600 dark:text-red-400">{parseError}</p>}
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Export your Google Sheet as .xlsx or .csv (File → Download), then upload it here. Columns can be in
            any order or named differently — you'll map them to fields on the next screen. Unrecognized columns
            are ignored.
          </p>
          <div className="flex justify-end pt-2">
            <button type="button" onClick={handleClose} className="border rounded px-4 py-2 dark:border-gray-600 dark:text-gray-100">Cancel</button>
          </div>
        </div>
      )}

      {step === 'map' && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">{fileName} — {rawRows.length} row(s) detected.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {FIELD_DEFS.map((field) => (
              <div key={field.key}>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                  {field.label}{field.required && ' *'}
                </label>
                <select
                  value={mapping[field.key] ?? ''}
                  onChange={(e) => setMapping({ ...mapping, [field.key]: e.target.value === '' ? undefined : Number(e.target.value) })}
                  className={`${inputClass} w-full`}
                >
                  <option value="">— Don't import —</option>
                  {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                </select>
              </div>
            ))}
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Plan for this batch (optional)</label>
            <select value={batchPlanId} onChange={(e) => setBatchPlanId(e.target.value)} className={`${inputClass} w-full sm:w-1/2`}>
              <option value="">— No batch plan —</option>
              {plans.map((p) => <option key={p._id} value={p._id}>{p.name} (₹{p.price})</option>)}
            </select>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Used for any row whose own Plan column is blank or doesn't match an existing plan by name.
              Every member who ends up with a plan (from their own row or this fallback) gets a cash payment
              recorded at the plan's price — same as adding a member one at a time.
            </p>
          </div>

          {missingRequired.length > 0 && (
            <p className="text-sm text-red-600 dark:text-red-400">
              Map required field(s): {missingRequired.map((f) => f.label).join(', ')}
            </p>
          )}

          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Preview (first {previewRows.length} of {rawRows.length} rows)</p>
            <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded">
              <table className="w-full text-xs text-left">
                <thead className="bg-gray-50 dark:bg-gray-900/40 text-gray-500 dark:text-gray-400">
                  <tr>{FIELD_DEFS.map((f) => <th key={f.key} className="px-2 py-1 font-medium">{f.label}</th>)}</tr>
                </thead>
                <tbody className="text-gray-700 dark:text-gray-200">
                  {previewRows.map((r, i) => (
                    <tr key={i} className="border-t border-gray-200 dark:border-gray-700">
                      <td className="px-2 py-1">{r.name || '—'}</td>
                      <td className="px-2 py-1">{r.phone || '—'}</td>
                      <td className="px-2 py-1">{r.email || '—'}</td>
                      <td className="px-2 py-1">{r.dob || '—'}</td>
                      <td className="px-2 py-1">{r.gender || '—'}</td>
                      <td className="px-2 py-1">{r.membershipPlanId ? plans.find((p) => p._id === r.membershipPlanId)?.name : '—'}</td>
                      <td className="px-2 py-1">{r.membershipStart || 'today'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={handleImport}
              disabled={submitting || missingRequired.length > 0}
              className="bg-gray-900 text-white rounded px-4 py-2 dark:bg-accent dark:text-accent-ink dark:font-semibold dark:hover:bg-accent-hover disabled:opacity-50"
            >
              {submitting ? 'Importing...' : `Import ${rawRows.length} Member${rawRows.length === 1 ? '' : 's'}`}
            </button>
            <button type="button" onClick={reset} className="border rounded px-4 py-2 dark:border-gray-600 dark:text-gray-100">Back</button>
          </div>
        </div>
      )}

      {step === 'result' && result && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-gray-700 dark:text-gray-200">
            <span className="text-green-600 dark:text-green-400 font-medium">{result.succeeded} imported</span>
            {result.failed > 0 && <> · <span className="text-red-600 dark:text-red-400 font-medium">{result.failed} failed</span></>}
            {result.paymentsRecorded > 0 && <> · {result.paymentsRecorded} payment{result.paymentsRecorded === 1 ? '' : 's'} recorded</>}
          </p>
          {result.failed > 0 && (
            <>
              <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded max-h-56 overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-gray-50 dark:bg-gray-900/40 text-gray-500 dark:text-gray-400">
                    <tr><th className="px-2 py-1">Row</th><th className="px-2 py-1">Name</th><th className="px-2 py-1">Error</th></tr>
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
                Download failed rows as CSV
              </button>
            </>
          )}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={handleClose} className="bg-gray-900 text-white rounded px-4 py-2 dark:bg-accent dark:text-accent-ink dark:font-semibold dark:hover:bg-accent-hover">Done</button>
            <button type="button" onClick={reset} className="border rounded px-4 py-2 dark:border-gray-600 dark:text-gray-100">Upload Another File</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
