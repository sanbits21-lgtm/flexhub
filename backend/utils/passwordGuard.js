const throttle = require('./loginThrottle');

// Screens that ask for your CURRENT password while you are already signed in (changing it, deleting your account) are
// a way to guess it too: a stolen 15-minute token, or a browser left open, could try passwords without limit. They get the
// same lock the sign-in screen has: five wrong passwords lock the check for a while, and a right one clears the count.
//
//   const guard = guardCurrentPassword('user', req.user._id);
//   if (await guard.locked(res)) return;          // answered 429 already
//   ... if the password is wrong: await guard.wrong(); respond 400
//   ... if it is right:           await guard.right();
const guardCurrentPassword = (kind, id) => {
  const key = throttle.keyFor(`${kind}-password`, id);
  return {
    async locked(res) {
      const lock = await throttle.check(key);
      if (!lock.locked) return false;
      const minutes = Math.max(1, Math.ceil(lock.retryAfterSec / 60));
      res.set('Retry-After', String(lock.retryAfterSec)).status(429).json({
        code: 'PASSWORD_CHECK_LOCKED',
        message: `Too many wrong passwords. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
        retryAfterSeconds: lock.retryAfterSec,
      });
      return true;
    },
    wrong: () => throttle.fail(key),
    right: () => throttle.clear(key),
  };
};

module.exports = { guardCurrentPassword };
