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

module.exports = { MIN_DIGITS, MAX_DIGITS, phoneDigits, isValidPhone, PHONE_MESSAGE };
