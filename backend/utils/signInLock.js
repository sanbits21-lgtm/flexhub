const throttle = require('./loginThrottle');

// Too many wrong passwords lock an account for a while, and during the lock even the right password is refused. So
// anything that gives someone a new password (their own reset link, or a temporary one from staff) has to lift the lock
// too, or the person is handed a password that still does not work.
//
// The lock is keyed by whatever the person typed to sign in, so it is lifted for each way they could have typed it.
const liftLock = async (kind, doc) => {
  const scopes = ['', String(doc.tenantId || '')];
  const typed = kind === 'member' ? [doc.memberCode, doc.email] : [doc.email];
  await Promise.all(typed.filter(Boolean).flatMap((id) => scopes.map((s) => throttle.clear(throttle.keyFor(kind, id, s)))));
};

module.exports = { liftLock };
