// What makes a chosen password too easy to guess. Length alone lets "Password123!" through, and
// that is exactly what a guesser tries first. Applied wherever a PERSON picks a password (signing
// up, changing it, staff accounts created with one); passwords the system generates are random.
//
// Returns null when the password is fine, otherwise a short phrase that reads after "Password",
// e.g. "is too common. Choose something harder to guess".

// The most-used passwords and the words people build them from. Checked after lower-casing and
// after stripping trailing digits/symbols, so "Welcome2024!" and "welcome1" both match "welcome".
const COMMON = new Set(`
password passw0rd p4ssword pass pass123 passcode passkey secret secret123 changeme change me
qwerty qwertyuiop asdfgh asdfghjkl zxcvbn zxcvbnm qazwsx qazwsxedc zaq12wsx 1qaz2wsx 1q2w3e4r 1q2w3e
abc abc123 abcd1234 abcdef abcdefg abcdefgh letmein welcome welcome1 login admin administrator root toor
user guest default test testing temp temporary demo sample master manager owner staff trainer member
iloveyou loveyou lovely sunshine princess dragon monkey shadow superman batman spiderman football baseball
basketball cricket hockey soccer michael jennifer jessica ashley daniel hannah hunter buster tigger
trustno1 whatever freedom starwars pokemon mustang ranger harley matrix computer internet google
flexhub fitzyclub fitzy flex gym gymowner fitness workout bodybuilding muscle strong iron barbell dumbbell protein
india bharat mumbai delhi bangalore bengaluru chennai hyderabad kolkata pune
krishna ganesh shiva sai sairam om omnamah hanuman lakshmi durga rama radha
111111 000000 121212 123123 123321 654321 666666 696969 7777777 888888 999999 112233
`.split(/\s+/).filter(Boolean));

// Straight runs a person types without thinking: number rows, alphabet, keyboard rows.
const RUNS = [
  '0123456789', '9876543210', 'abcdefghijklmnopqrstuvwxyz', 'zyxwvutsrqponmlkjihgfedcba',
  'qwertyuiop', 'poiuytrewq', 'asdfghjkl', 'lkjhgfdsa', 'zxcvbnm', 'mnbvcxz', '1qaz2wsx3edc',
];

const alnum = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * @param {string} password
 * @param {{ email?: string, name?: string, phone?: string }} [who] the person it is for
 */
const checkPassword = (password, who = {}) => {
  const raw = String(password ?? '');
  if (raw.length < 8) return null; // length has its own message
  const lower = raw.toLowerCase();

  if (new Set(raw).size <= 2) return 'is too repetitive. Use a mix of different characters';

  const base = lower.replace(/[\d!@#$%^&*()._\-+=~?]+$/, '');
  if (COMMON.has(lower) || (base.length >= 3 && COMMON.has(base))) return 'is too common. Choose something harder to guess';

  const flat = alnum(raw);
  if (flat.length >= 6 && RUNS.some((run) => run.includes(flat))) return 'is a keyboard or number run. Choose something harder to guess';

  // Not the person's own details: the first things anyone who knows them would try.
  const local = alnum(String(who.email || '').split('@')[0]);
  const nameWords = String(who.name || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
  const phoneDigits = String(who.phone || '').replace(/\D/g, '');
  const digitsIn = raw.replace(/\D/g, '');
  const personal = (local.length >= 4 && flat.includes(local))
    || nameWords.some((w) => flat.includes(w))
    || (phoneDigits.length >= 6 && digitsIn.includes(phoneDigits.slice(-6)));
  if (personal) return 'should not contain your name, email or phone number';

  return null;
};

/** The same check, worded as a full sentence for an API error. */
const passwordProblem = (password, who) => {
  const problem = checkPassword(password, who);
  return problem ? `Password ${problem}.` : null;
};

module.exports = { checkPassword, passwordProblem };
