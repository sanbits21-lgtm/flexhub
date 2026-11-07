const Tenant = require('../models/Tenant');
const User = require('../models/User');
const { templated } = require('./mailer');
const { gymLoginUrl } = require('./links');
const { endOf, daysUntil, DAY, GRACE_DAYS } = require('./subscription');

// Owners hear three times about each end date: a week out, the last day, and when it has ended.
const stageFor = (daysLeft) => (daysLeft <= 0 ? 0 : daysLeft <= 1 ? 1 : daysLeft <= 7 ? 7 : null);
// Do not mail about periods that ended long ago (a job that was down, an old forgotten gym).
const LOOKBACK_DAYS = 30;

const fmt = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** Where an email can send people to sign in. Only possible when PUBLIC_URL says where the site lives. */
const loginLink = (tenant) => {
  if (!process.env.PUBLIC_URL) return undefined;
  const url = new URL(process.env.PUBLIC_URL);
  return gymLoginUrl(tenant, { protocol: url.protocol.replace(':', ''), get: () => url.host });
};

/** Everyone who should hear about a gym's billing: its owners, else its contact address. */
const ownerEmails = async (tenant) => {
  const owners = await User.find({ tenantId: tenant._id, role: 'tenant-admin', isActive: true, emailVerified: { $ne: false } }).select('email').lean();
  const emails = new Set(owners.map((o) => o.email));
  if (!emails.size && tenant.contactEmail) emails.add(tenant.contactEmail);
  return [...emails];
};

const messageFor = (tenant, stage, daysLeft) => {
  const trial = tenant.billingPlan === 'trial';
  const what = trial ? 'free trial' : `${tenant.packageName || 'subscription'} plan`;
  const end = fmt(endOf(tenant));
  if (stage === 0) {
    return trial
      ? { subject: `Your ${tenant.name} free trial has ended`, heading: 'Your free trial has ended', body: `${tenant.name}'s free trial ended on ${end}. Your data is safe and you can still view it, but changes are paused. Contact us to choose a plan and continue.` }
      : { subject: `Your ${tenant.name} plan has ended`, heading: 'Your subscription has ended', body: `${tenant.name}'s ${what} ended on ${end}. Everything keeps working for ${GRACE_DAYS} more days, after which changes are paused (your data stays safe and viewable). Contact us to renew.` };
  }
  const when = stage === 1 ? 'tomorrow' : `in ${daysLeft} days`;
  return {
    subject: `Your ${tenant.name} ${trial ? 'free trial' : 'plan'} ends ${when}`,
    heading: `Your ${trial ? 'free trial' : 'subscription'} ends ${when}`,
    body: `${tenant.name}'s ${what} ends on ${end}. ${trial ? 'Contact us to choose a plan so nothing is interrupted.' : 'Contact us to renew so nothing is interrupted.'}`,
  };
};

/**
 * Emails owners whose trial or paid plan is ending or has ended, once per stage per end date,
 * and sends platform staff one summary of who was told. Safe to run as often as you like, and
 * from several servers at once: a stage is claimed with one conditional write before sending.
 * Returns the gyms notified, for the summary and for tests.
 */
const runExpiryNotices = async (now = new Date()) => {
  const horizon = new Date(now.getTime() + 7 * DAY);
  const floor = new Date(now.getTime() - LOOKBACK_DAYS * DAY);
  const candidates = await Tenant.find({
    approvalStatus: { $nin: ['pending', 'rejected'] },
    isActive: true,
    billingStatus: { $nin: ['suspended', 'cancelled'] },
    $or: [
      { billingPlan: 'trial', trialEndsAt: { $gte: floor, $lte: horizon } },
      { billingPlan: { $ne: 'trial' }, planEndsAt: { $gte: floor, $lte: horizon } },
    ],
  });

  const notified = [];
  for (const tenant of candidates) {
    const end = endOf(tenant);
    if (!end) continue;
    const daysLeft = daysUntil(end, now);
    const stage = stageFor(daysLeft);
    if (stage === null) continue;
    // Claim this stage; a concurrent run (or an earlier one) makes this write match nothing.
    const claim = await Tenant.updateOne(
      { _id: tenant._id, $or: [{ 'expiryNotice.forEnd': { $ne: end } }, { 'expiryNotice.stage': { $gt: stage } }] },
      { $set: { expiryNotice: { stage, forEnd: end, sentAt: now } } },
    );
    if (!claim.modifiedCount) continue;
    const msg = messageFor(tenant, stage, daysLeft);
    const link = loginLink(tenant);
    const to = await ownerEmails(tenant);
    await Promise.all(to.map((email) => templated({ to: email, ...msg, ...(link ? { buttonText: 'Open FlexHub', buttonUrl: link } : {}) })));
    notified.push({ tenantId: String(tenant._id), name: tenant.name, plan: tenant.packageName || tenant.billingPlan, end, stage });
  }

  if (notified.length) await sendStaffSummary(notified);
  return notified;
};

const STAGE_WORD = { 7: 'ends within a week', 1: 'ends tomorrow', 0: 'has ended' };

// One email per platform user listing the gyms just notified (scoped admins only see their own).
const sendStaffSummary = async (rows) => {
  const staff = await User.find({ role: { $in: ['super-admin', 'platform-admin'] }, isActive: true }).select('email role managedTenantIds').lean();
  await Promise.all(staff.map((s) => {
    const managed = (s.managedTenantIds || []).map(String);
    const mine = managed.length ? rows.filter((r) => managed.includes(r.tenantId)) : rows;
    if (!mine.length) return null;
    return templated({
      to: s.email,
      subject: `${mine.length} gym${mine.length === 1 ? '' : 's'} with a plan ending or ended`,
      heading: 'Plans to follow up',
      body: mine.map((r) => `${r.name} (${r.plan}) ${STAGE_WORD[r.stage]}: ${fmt(r.end)}`).join('. '),
    });
  }));
};

const SIX_HOURS = 6 * 60 * 60 * 1000;

/** Runs the notices shortly after start and then every few hours, for the life of the server. */
const startExpiryScheduler = () => {
  if (String(process.env.EXPIRY_NOTICES || 'on').toLowerCase() === 'off') return;
  const tick = () => runExpiryNotices().catch((e) => console.error('Expiry notices failed:', e.message));
  setTimeout(tick, 30 * 1000).unref();
  setInterval(tick, SIX_HOURS).unref();
};

module.exports = { runExpiryNotices, startExpiryScheduler, ownerEmails, stageFor, fmt };
