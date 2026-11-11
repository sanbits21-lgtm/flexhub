// The version of the Terms of Service (backend/public/terms.html) that a new gym agrees to when it
// registers. Change it, and the date on the page, whenever the terms change in a way that matters.
const TERMS_VERSION = '2026-11-10';
const TERMS_UPDATED = '10 November 2026';

// Registration needs a ticked box by default. TERMS_REQUIRED=off lets an operator run without it
// (the test suite does, so its sign-up fixtures need not all carry the flag).
const termsRequired = () => String(process.env.TERMS_REQUIRED || 'on').toLowerCase() !== 'off';

module.exports = { TERMS_VERSION, TERMS_UPDATED, termsRequired };
