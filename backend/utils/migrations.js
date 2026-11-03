const Member = require('../models/Member');

// Idempotent, safe to run on every start. Mongoose creates new indexes but never drops old
// ones, so the legacy platform-wide unique index on member email has to be removed by hand.
const run = async () => {
  try {
    const indexes = await Member.collection.indexes();
    if (indexes.some((i) => i.name === 'email_1')) {
      await Member.collection.dropIndex('email_1');
      console.log('Migration: dropped legacy members.email_1 (email is now unique per gym)');
    }
  } catch (err) {
    // The collection may not exist yet (fresh database), which is fine.
    if (err.codeName !== 'NamespaceNotFound' && err.code !== 26) console.error('Migration failed:', err.message);
  }
  await Member.createIndexes();
};

module.exports = { run };
