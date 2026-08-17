// `membershipStatus` is a stored field that nothing automatically flips when a
// membership lapses, so an expired member usually still reads 'active' in the DB.
// Rather than run a scheduled job, expiry is derived from `membershipEnd` at read
// time — the same approach the dashboards already take.
//
// Only 'active' is re-derived: 'frozen' and 'cancelled' are deliberate staff
// decisions and must not be overwritten by a date comparison.
const deriveMembershipStatus = (member, now = new Date()) => {
  if (!member) return member;
  if (member.membershipStatus !== 'active') return member.membershipStatus;
  if (member.membershipEnd && new Date(member.membershipEnd) < now) return 'expired';
  return 'active';
};

// Mongoose docs are not plain objects — convert first so the derived value survives
// serialization instead of being shadowed by the stored one.
const withDerivedStatus = (member, now = new Date()) => {
  if (!member) return member;
  const obj = typeof member.toObject === 'function' ? member.toObject() : { ...member };
  obj.membershipStatus = deriveMembershipStatus(obj, now);
  return obj;
};

// Translates a requested status filter into a Mongo query that agrees with the
// derived value above, so filtering by 'expired' also catches members still stored
// as 'active' whose end date has passed (and 'active' excludes them).
const statusFilter = (membershipStatus, now = new Date()) => {
  if (membershipStatus === 'expired') {
    return { $or: [{ membershipStatus: 'expired' }, { membershipStatus: 'active', membershipEnd: { $lt: now } }] };
  }
  if (membershipStatus === 'active') {
    return { membershipStatus: 'active', $or: [{ membershipEnd: { $gte: now } }, { membershipEnd: null }] };
  }
  return { membershipStatus };
};

module.exports = { deriveMembershipStatus, withDerivedStatus, statusFilter };
