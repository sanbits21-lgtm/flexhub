const mongoose = require('mongoose');

// Failed sign-ins per ACCOUNT (not per network address, which the rate limiter already covers), so
// a password guesser spread over many addresses is still stopped. The key is made from what was
// TYPED, whether or not such an account exists, so a lock looks the same either way and cannot be
// used to find out who has an account. See utils/loginThrottle.js.
const loginAttemptSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  failures: { type: Number, default: 0 },
  windowStart: { type: Date },
  lockedUntil: { type: Date },
  // Locks since the last successful sign-in; each one lasts longer, up to 4x.
  lockCount: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
});

loginAttemptSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('LoginAttempt', loginAttemptSchema);
