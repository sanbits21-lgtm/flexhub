// ClassSession.status is a stored field that nothing automatically flips once a
// session's time has passed, so a session from three weeks ago would still read
// 'scheduled' forever. Same fix as Member.membershipStatus (utils/membershipStatus.js):
// derive it from endAt vs now at read time instead of relying on a scheduled job.
//
// Only 'scheduled' is re-derived: 'cancelled' is a deliberate staff decision and must
// not be overwritten by a date comparison.
const deriveSessionStatus = (session, now = new Date()) => {
  if (!session) return session;
  if (session.status !== 'scheduled') return session.status;
  if (session.endAt && new Date(session.endAt) < now) return 'completed';
  return 'scheduled';
};

// Mongoose docs are not plain objects — convert first so the derived value survives
// serialization instead of being shadowed by the stored one.
const withDerivedSessionStatus = (session, now = new Date()) => {
  if (!session) return session;
  const obj = typeof session.toObject === 'function' ? session.toObject() : { ...session };
  obj.status = deriveSessionStatus(obj, now);
  return obj;
};

// Whether a session can still accept a new booking — the derived status, not the raw
// stored one, so staff can't book into a session that's already over just because
// nobody explicitly cancelled it.
const isBookable = (session, now = new Date()) => deriveSessionStatus(session, now) === 'scheduled';

// Translates a requested status filter into a Mongo query that agrees with the derived
// value above — same shape as utils/membershipStatus.js's statusFilter. 'cancelled' is
// always a stored, authoritative value; 'scheduled'/'completed' are date-derived.
const sessionStatusFilter = (status, now = new Date()) => {
  if (status === 'completed') {
    return { $or: [{ status: 'completed' }, { status: 'scheduled', endAt: { $lt: now } }] };
  }
  if (status === 'scheduled') {
    return { status: 'scheduled', endAt: { $gte: now } };
  }
  return { status };
};

module.exports = { deriveSessionStatus, withDerivedSessionStatus, isBookable, sessionStatusFilter };
