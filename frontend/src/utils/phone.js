// The same rule the server applies (backend/utils/phoneNumber.js): digits with an optional leading +, spaces, dashes and
// brackets, and 10 to 15 digits in all. Without it a phone box took any text of any length.
export const MIN_DIGITS = 10;
export const MAX_DIGITS = 15;
export const PHONE_HINT = 'Enter 10 to 15 digits, for example 9876543210';

const SHAPE = /^\+?[0-9(][0-9\s\-()]*$/;

export const isValidPhone = (value) => {
  const text = String(value ?? '').trim();
  if (!SHAPE.test(text)) return false;
  const digits = text.replace(/\D/g, '').length;
  return digits >= MIN_DIGITS && digits <= MAX_DIGITS;
};

/** Spread onto a phone <input>: a phone keyboard on mobile, a length cap, and the browser's own check on submit. */
export const phoneProps = {
  type: 'tel',
  inputMode: 'tel',
  autoComplete: 'tel',
  maxLength: 20,
  pattern: '\\+?(?:[\\s\\-\\(\\)]*\\d){10,15}[\\s\\-\\(\\)]*',
  title: PHONE_HINT,
};
