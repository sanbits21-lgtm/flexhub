const { BadRequest } = require('./query');

// A gym's own extra member fields (Address, Blood group, Locker no...). The definitions live on
// the Tenant; each member stores only the values, under customFields, keyed by a slug that
// never changes once created (the label can be reworded later without touching any member).
const MAX_FIELDS = 20;
const MAX_TEXT = 200;
const FIELD_TYPES = ['text', 'number', 'date'];

const slug = (label) => String(label)
  .normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32);

const cleanLabel = (value) => {
  const label = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (!label) throw new BadRequest('Field name is required.');
  if (label.length > 40) throw new BadRequest('Field name must be 40 characters or fewer.');
  if (!slug(label)) throw new BadRequest('Field name must contain letters or numbers.');
  return label;
};

const cleanType = (value) => {
  const type = value === undefined || value === '' ? 'text' : value;
  if (!FIELD_TYPES.includes(type)) throw new BadRequest(`Field type must be one of ${FIELD_TYPES.join(', ')}.`);
  return type;
};

/** A key for `label` that no existing definition uses: address, address_2, address_3... */
const uniqueKey = (label, defs) => {
  const base = slug(label) || 'field';
  const taken = new Set(defs.map((d) => d.key));
  let key = base;
  for (let n = 2; taken.has(key); n += 1) key = `${base}_${n}`;
  return key;
};

const toIsoDate = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

const cleanValue = (def, raw) => {
  if (def.type === 'number') {
    const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/,/g, '').trim());
    if (!Number.isFinite(n) || Math.abs(n) > 1e12) throw new BadRequest(`${def.label} must be a number.`);
    return n;
  }
  if (def.type === 'date') {
    const iso = toIsoDate(typeof raw === 'string' ? raw.trim() : raw);
    if (!iso) throw new BadRequest(`${def.label} must be a date.`);
    return iso;
  }
  const text = String(raw).trim();
  if (text.length > MAX_TEXT) throw new BadRequest(`${def.label} is too long (max ${MAX_TEXT} characters).`);
  return text;
};

/**
 * Validates `input` ({ key: value }) against the gym's definitions. Returns { set, unset }:
 * blank values (empty string / null) are returned in `unset` so an update can clear a value,
 * while a create simply ignores them. A key the gym has not defined is an error, not silently
 * dropped, so a typo or another gym's key can never write data nobody can see.
 */
const cleanCustomFields = (defs, input) => {
  const set = {};
  const unset = [];
  if (input === undefined || input === null) return { set, unset };
  if (typeof input !== 'object' || Array.isArray(input)) throw new BadRequest('customFields must be an object.');
  const byKey = new Map((defs || []).map((d) => [d.key, d]));
  for (const [key, raw] of Object.entries(input)) {
    const def = byKey.get(key);
    if (!def) throw new BadRequest(`Unknown field: ${key.slice(0, 40)}`);
    if (raw === '' || raw === null || raw === undefined || (typeof raw === 'string' && !raw.trim())) unset.push(key);
    else set[key] = cleanValue(def, raw);
  }
  return { set, unset };
};

/** Digits only; the last 10 when longer, so +91 98765 43210 and 9876543210 are the same number. */
const phoneKey = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
};

module.exports = { MAX_FIELDS, MAX_TEXT, FIELD_TYPES, cleanLabel, cleanType, uniqueKey, cleanCustomFields, phoneKey, slug };
