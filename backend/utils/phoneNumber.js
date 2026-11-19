// One rule for every phone number the app stores: only digits and the usual separators (+ at the start, spaces,
// dashes, brackets), and 10 to 15 digits in all (10 for a local number, up to 15 with a country code, which is the
// international maximum). Short numbers and 25-digit typos used to be accepted.
const MIN_DIGITS = 10;
const MAX_DIGITS = 15;
const SHAPE = /^\+?[0-9(][0-9\s\-()]*$/;

const phoneDigits = (value) => String(value ?? '').replace(/\D/g, '');

const isValidPhone = (value) => {
  const text = String(value ?? '').trim();
  if (!SHAPE.test(text)) return false;
  const n = phoneDigits(text).length;
  return n >= MIN_DIGITS && n <= MAX_DIGITS;
};

const PHONE_MESSAGE = 'must be a phone number with 10 to 15 digits, for example 9876543210';

/**
 * For an EDIT: a number saved before the rule existed may be short or oddly formatted, and the edit forms send the phone back
 * with every save. Refuse a bad number only when it is a change; the same stored value is left alone so the rest of the record
 * can still be edited. Returns a message, or null when fine. `field` may be a dotted path (emergencyContact.phone).
 */
const phoneEditProblem = async (Model, filter, phone, field = 'phone') => {
  if (phone === undefined || phone === null || phone === '' || isValidPhone(phone)) return null;
  const existing = await Model.findOne(filter).select(field).lean();
  const current = field.split('.').reduce((o, k) => (o ? o[k] : undefined), existing);
  if (existing && String(current ?? '').trim() === String(phone).trim()) return null;
  return `${field === 'phone' || field === 'contactPhone' ? 'Phone' : 'Emergency contact phone'} ${PHONE_MESSAGE}`;
};

module.exports = { MIN_DIGITS, MAX_DIGITS, phoneDigits, isValidPhone, phoneEditProblem, PHONE_MESSAGE };
