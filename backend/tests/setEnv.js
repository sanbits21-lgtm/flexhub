// Runs before the test framework loads. NODE_ENV=test disables rate limiting in app.js
// (the suite would otherwise trip its own login limiter) and silences error logging.
process.env.NODE_ENV = 'test';
