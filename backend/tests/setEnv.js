// Runs before the test framework loads. NODE_ENV=test disables rate limiting in app.js
// (the suite would otherwise trip its own login limiter) and silences error logging.
process.env.NODE_ENV = 'test';
// Sign-up fixtures across the suite do not tick the terms box; tests/terms.test.js turns the rule back on.
process.env.TERMS_REQUIRED = 'off';
