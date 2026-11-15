const Member = require('../models/Member');
const MembershipPlan = require('../models/MembershipPlan');

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
  // A plan used to name one branch (or none, meaning all); it now names a list. One pass turns the old field
  // into the list and removes it, and a plan with no branch becomes an empty list ("every branch").
  try {
    const res = await MembershipPlan.collection.updateMany(
      { branchId: { $exists: true } },
      [{ $set: { branchIds: { $cond: [{ $ifNull: ['$branchId', false] }, ['$branchId'], []] } } }, { $unset: 'branchId' }]
    );
    if (res.modifiedCount) console.log(`Migration: moved ${res.modifiedCount} membership plan(s) from branchId to branchIds`);
  } catch (err) {
    if (err.codeName !== 'NamespaceNotFound' && err.code !== 26) console.error('Plan migration failed:', err.message);
  }
  await Member.createIndexes();
};

module.exports = { run };
