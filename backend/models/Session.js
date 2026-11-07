const mongoose = require('mongoose');

// One row per refresh token. Signing in starts a "family"; every refresh retires the current token
// and creates the next one in the same family, so presenting a token that was already retired
// (a copy someone stole) is detectable and kills the whole family. Only a hash of the token is
// kept, so a database leak does not hand out working sessions. See utils/sessions.js.
const sessionSchema = new mongoose.Schema({
  actorType: { type: String, enum: ['user', 'member'], required: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  familyId: { type: String, required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  // When this family first signed in; caps how long refreshing can go on (REFRESH_MAX_DAYS).
  startedAt: { type: Date, required: true },
  // A retired token is kept for a day (to recognise reuse), then the TTL index removes it.
  expiresAt: { type: Date, required: true },
  rotatedAt: { type: Date },
  userAgent: { type: String, maxlength: 200 },
  ip: { type: String, maxlength: 64 },
}, { timestamps: true });

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Session', sessionSchema);
