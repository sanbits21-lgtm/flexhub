// Helpers for the gym's own member fields (Address, Blood group...). The definitions come from
// /tenant-settings/member-fields; values live on each member under customFields.

export const FIELD_TYPE_LABEL = { text: 'Text', number: 'Number', date: 'Date' };

const isBlank = (v) => v === undefined || v === null || String(v).trim() === '';

/**
 * The calendar day a spreadsheet date cell means, as yyyy-mm-dd. A cell is read as a Date at
 * (about) local midnight, so formatting it with toISOString() lands on the PREVIOUS day anywhere
 * east of UTC (India included). Half a day is added first so rounding can only go to the right
 * day, whichever way the reader nudged it, and the local calendar is read back.
 */
export const dateOnly = (date) => {
  const d = new Date(date.getTime() + 12 * 3600 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const toIsoDate = (value) => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : dateOnly(value);
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return Number.isNaN(new Date(text).getTime()) ? null : text; // already a day
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : dateOnly(d);
};

/** How a stored value reads in a table cell. */
export const formatFieldValue = (def, value) => {
  if (isBlank(value)) return '—';
  if (def.type === 'date') {
    // A stored day (yyyy-mm-dd) is shown as that same day in every timezone: parsing it as UTC
    // would show the day before anywhere west of Greenwich.
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
    const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }
  if (def.type === 'number') return Number(value).toLocaleString();
  return String(value);
};

/** The value as an <input> wants it (always a string). */
export const toInputValue = (def, value) => {
  if (isBlank(value)) return '';
  return def.type === 'date' ? String(value).slice(0, 10) : String(value);
};

/**
 * What to send for a form's values: only the fields that have a value, or - when `clearBlank`
 * is set (editing) - every field, with '' for the ones to clear.
 */
export const payloadFromForm = (defs, values, { clearBlank = false } = {}) => {
  const out = {};
  defs.forEach((def) => {
    const v = values?.[def.key];
    if (!isBlank(v)) out[def.key] = typeof v === 'string' ? v.trim() : v;
    else if (clearBlank) out[def.key] = '';
  });
  return out;
};

/** Best guess at a column's type from sample cells: all numbers -> number, all dates -> date. */
export const detectType = (samples) => {
  const cells = samples.filter((v) => !isBlank(v));
  if (cells.length === 0) return 'text';
  const numeric = (v) => typeof v === 'number' || /^-?[\d,]+(\.\d+)?$/.test(String(v).trim());
  if (cells.every(numeric)) return 'number';
  const dateLike = (v) => v instanceof Date || /^\d{4}-\d{2}-\d{2}$/.test(String(v).trim());
  if (cells.every((v) => dateLike(v) && toIsoDate(v))) return 'date';
  return 'text';
};

/** A spreadsheet cell as the API wants it for a field of this type. */
export const cellToFieldValue = (def, cell) => {
  if (isBlank(cell)) return undefined;
  if (def.type === 'date') return toIsoDate(typeof cell === 'string' ? cell.trim() : cell) || String(cell).trim();
  return typeof cell === 'number' ? cell : String(cell).trim();
};
