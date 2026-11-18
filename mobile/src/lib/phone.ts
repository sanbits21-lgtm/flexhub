// The same rule the server applies: digits with an optional leading + (and spaces, dashes, brackets), 10 to 15 digits in all.
const SHAPE = /^\+?[0-9(][0-9\s\-()]*$/;

export function isValidPhone(value: string): boolean {
  const text = value.trim();
  if (!SHAPE.test(text)) return false;
  const digits = text.replace(/\D/g, '').length;
  return digits >= 10 && digits <= 15;
}

export const PHONE_PROBLEM = 'Enter 10 to 15 digits, for example 98765 43210.';
