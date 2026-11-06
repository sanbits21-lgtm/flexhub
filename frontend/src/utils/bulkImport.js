import * as XLSX from 'xlsx';
import { cellToFieldValue, dateOnly, detectType } from './memberFields';

// The built-in member fields a file column can map to. Order matters for auto-matching: the more
// specific "emergency ..." fields come before the generic Name/Phone so a header like
// "Emergency Phone" is not swallowed by the plain Phone field.
export const BUILTIN_FIELDS = [
  { key: 'emergencyContactName', label: 'Emergency contact name', aliases: ['emergency contact', 'emergency contact name', 'emergency name', 'guardian', 'guardian name'] },
  { key: 'emergencyContactPhone', label: 'Emergency contact phone', aliases: ['emergency phone', 'emergency contact phone', 'emergency number', 'emergency contact number', 'guardian phone'] },
  { key: 'name', label: 'Name', required: true, aliases: ['name', 'full name', 'member name', 'customer name'] },
  { key: 'phone', label: 'Phone', required: true, aliases: ['phone', 'phone number', 'mobile', 'mobile number', 'contact', 'contact number'] },
  { key: 'email', label: 'Email', aliases: ['email', 'email address', 'e-mail'] },
  { key: 'dob', label: 'Date of Birth', aliases: ['dob', 'date of birth', 'birthday', 'birth date'] },
  { key: 'gender', label: 'Gender', aliases: ['gender', 'sex'] },
  { key: 'membershipPlanName', label: 'Membership Plan', aliases: ['plan', 'membership plan', 'package', 'plan name'] },
  { key: 'membershipStart', label: 'Start Date', aliases: ['start date', 'membership start', 'join date', 'joining date', 'start'] },
];
export const REQUIRED_FIELDS = BUILTIN_FIELDS.filter((f) => f.required);
export const MAX_ROWS = 1000; // the API's own limit per upload

export const CUSTOM_PREFIX = 'cf:';
export const customTarget = (key) => `${CUSTOM_PREFIX}${key}`;
export const customKeyOf = (target) => (target && target.startsWith(CUSTOM_PREFIX) ? target.slice(CUSTOM_PREFIX.length) : null);

const norm = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const isBlank = (v) => v === undefined || v === null || String(v).trim() === '';

/** One target per file column ('' = not imported), guessed from the header names. */
export const autoMapTargets = (headers, customFields = []) => {
  const names = headers.map(norm);
  const targets = headers.map(() => '');
  const claimed = new Set();
  const claim = (i, target) => { targets[i] = target; claimed.add(i); };
  // exact names first, so "Phone" always wins over a looser match for another field
  BUILTIN_FIELDS.forEach((f) => {
    const i = names.findIndex((h, idx) => !claimed.has(idx) && f.aliases.includes(h));
    if (i !== -1) claim(i, f.key);
  });
  customFields.forEach((f) => {
    const i = names.findIndex((h, idx) => !claimed.has(idx) && (h === norm(f.label) || h === f.key));
    if (i !== -1) claim(i, customTarget(f.key));
  });
  // then headers that merely contain a known name ("Mobile No.", "Member's Full Name")
  BUILTIN_FIELDS.forEach((f) => {
    if (targets.includes(f.key)) return;
    const i = names.findIndex((h, idx) => !claimed.has(idx) && h && f.aliases.some((a) => h.includes(a)));
    if (i !== -1) claim(i, f.key);
  });
  return targets;
};

const GENDER_MAP = {
  m: 'male', male: 'male', f: 'female', female: 'female', other: 'other', o: 'other',
  'prefer not to say': 'prefer_not_say', prefer_not_say: 'prefer_not_say',
};

export const normalizeDate = (value) => {
  if (!value) return undefined;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return value.trim();
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : dateOnly(d);
};

/** Case-insensitive plan lookup by name. */
export const findPlan = (plans, name) => {
  const n = norm(name);
  return n ? plans.find((p) => norm(p.name) === n) || null : null;
};

/**
 * One file row as the API wants it. `planName` stays alongside so the screen can tell which rows
 * name a plan that does not exist; `toPayload` strips it before sending.
 */
export const buildRow = (rawRow, targets, { plans, batchPlanId, fields }) => {
  const cell = {};
  const custom = {};
  targets.forEach((target, i) => {
    if (!target) return;
    const key = customKeyOf(target);
    if (key) {
      const def = fields.find((f) => f.key === key);
      const value = def ? cellToFieldValue(def, rawRow[i]) : undefined;
      if (value !== undefined) custom[key] = value;
    } else {
      cell[target] = rawRow[i];
    }
  });
  const text = (v) => (isBlank(v) ? undefined : String(v).trim());
  const planName = text(cell.membershipPlanName);
  const plan = findPlan(plans, planName) || (batchPlanId ? plans.find((p) => p._id === batchPlanId) : null);
  const emergencyName = text(cell.emergencyContactName);
  const emergencyPhone = text(cell.emergencyContactPhone);
  return {
    name: text(cell.name) || '',
    phone: text(cell.phone) || '',
    email: text(cell.email),
    dob: normalizeDate(cell.dob),
    gender: isBlank(cell.gender) ? undefined : GENDER_MAP[norm(cell.gender)],
    membershipPlanId: plan?._id,
    membershipStart: normalizeDate(cell.membershipStart),
    emergencyContact: emergencyName || emergencyPhone ? { name: emergencyName, phone: emergencyPhone } : undefined,
    customFields: Object.keys(custom).length ? custom : undefined,
    planName,
  };
};

export const toPayload = ({ planName, ...row }) => row;

/** Plan names the file uses that match no plan, with how many rows use each. */
export const unmatchedPlans = (rows, plans) => {
  const seen = new Map();
  rows.forEach((r) => {
    if (!r.planName || findPlan(plans, r.planName)) return;
    const k = norm(r.planName);
    seen.set(k, { name: r.planName, count: (seen.get(k)?.count || 0) + 1 });
  });
  return [...seen.values()];
};

/** Digits only, last 10 when longer: "+91 98765 43210" and "9876543210" are one number. */
export const phoneKey = (phone) => {
  const digits = String(phone ?? '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
};

/** Row index -> index of the earlier row with the same phone. */
export const repeatedInFile = (rows) => {
  const first = new Map();
  const repeats = new Map();
  rows.forEach((r, i) => {
    const k = phoneKey(r.phone);
    if (!k) return;
    if (first.has(k)) repeats.set(i, first.get(k));
    else first.set(k, i);
  });
  return repeats;
};

/** A guess at a new plan's length from what the file calls it. */
export const guessDuration = (name) => {
  const n = norm(name);
  if (/year|annual|12\s*m/.test(n)) return n.includes('half') ? 'half_yearly' : 'yearly';
  if (/half|6\s*m|six/.test(n)) return 'half_yearly';
  if (/quarter|3\s*m|three/.test(n)) return 'quarterly';
  return 'monthly';
};

/** How a spreadsheet cell reads on screen. */
export const showCell = (v) => {
  if (isBlank(v)) return '';
  if (v instanceof Date) return dateOnly(v);
  return String(v);
};

export const sampleValues = (rawRows, col, n = 3) => {
  const out = [];
  for (const r of rawRows) {
    if (!isBlank(r[col])) out.push(r[col]);
    if (out.length === n) break;
  }
  return out;
};

export const suggestType = (rawRows, col) => detectType(sampleValues(rawRows, col, 50));

/** A starter sheet with the gym's own plan names and extra fields as columns. */
export const downloadSampleSheet = ({ plans, fields }) => {
  const planNames = plans.length ? plans.slice(0, 3).map((p) => p.name) : ['Monthly', 'Quarterly', 'Yearly'];
  const sampleFor = (f, i) => (f.type === 'number' ? 10 + i : f.type === 'date' ? '2026-01-15' : `${f.label} sample`);
  const header = ['Name', 'Phone', 'Email', 'Date of Birth', 'Gender', 'Membership Plan', 'Start Date', ...fields.map((f) => f.label)];
  const people = [
    ['Arjun Mehta', '9876500001', 'arjun@example.com', '1994-03-12', 'Male'],
    ['Priya Nair', '9876500002', 'priya@example.com', '1998-07-25', 'Female'],
    ['Rahul Verma', '9876500003', '', '1990-01-05', 'Male'],
  ];
  const rows = people.map((p, i) => [...p, planNames[i % planNames.length], '', ...fields.map((f) => sampleFor(f, i))]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws['!cols'] = header.map((h) => ({ wch: Math.max(14, h.length + 2) }));
  // phone as text so a leading 0 survives
  rows.forEach((_, r) => { const c = ws[XLSX.utils.encode_cell({ r: r + 1, c: 1 })]; if (c) { c.t = 's'; c.z = '@'; } });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Members');
  XLSX.writeFile(wb, 'members-bulk-upload-sample.xlsx');
};
