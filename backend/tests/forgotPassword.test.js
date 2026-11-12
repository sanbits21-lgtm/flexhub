const { app, request, connect, disconnect, seedTenant, createMember, login, auth, uniq, PASSWORD } = require('./helpers');
const { outbox } = require('../utils/mailer');
const User = require('../models/User');
const Member = require('../models/Member');
const AuditLog = require('../models/AuditLog');

const NEW_PASSWORD = 'Copper-Harbor-91!';
let t; let other;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mailsTo = (to, subject) => outbox.filter((m) => m.to === to && (!subject || subject.test(m.subject)));
// The email is sent after the reply, so wait for it (and, when none is expected, give it time not to come).
const waitForMail = async (to, subject, tries = 40) => {
  for (let i = 0; i < tries; i += 1) {
    const found = mailsTo(to, subject);
    if (found.length) return found;
    await sleep(50);
  }
  return [];
};
const tokenFrom = (mail) => (mail.text.match(/token=([0-9a-f]{64})/) || [])[1];
const askStaff = (email) => request(app).post('/api/auth/forgot-password').send({ email });
const resetStaff = (token, password) => request(app).post('/api/auth/reset-password').send({ token, password });
const askMember = (identifier) => request(app).post('/api/member-auth/forgot-password').send({ identifier });
const resetMember = (token, password) => request(app).post('/api/member-auth/reset-password').send({ token, password });
const RESET = /reset your password/i;

beforeAll(async () => {
  await connect();
  t = await seedTenant('forgot');
  other = await seedTenant('forgot-other');
}, 90000);
afterAll(disconnect);
beforeEach(() => { outbox.length = 0; });

describe('staff: asking for a link', () => {
  it('emails a single-use link, and stores only its hash', async () => {
    const res = await askStaff(t.manager.email);
    expect(res.status).toBe(200);
    const [mail] = await waitForMail(t.manager.email, RESET);
    expect(mail.text).toMatch(/\/reset-password\?token=[0-9a-f]{64}/);
    const raw = tokenFrom(mail);
    const stored = await User.findById(t.manager._id).select('passwordResetTokenHash passwordResetTokenExpires');
    expect(stored.passwordResetTokenHash).toBeDefined();
    expect(stored.passwordResetTokenHash).not.toBe(raw); // never the token itself
    expect(stored.passwordResetTokenExpires.getTime()).toBeGreaterThan(Date.now() + 50 * 60000);
  });

  it('answers the same for an address that has no account, and sends nothing', async () => {
    const real = await askStaff(t.trainer.email);
    await waitForMail(t.trainer.email, RESET); // its email is sent after the reply: let it land before comparing
    outbox.length = 0;
    const fake = await askStaff(`nobody-${uniq('x')}@example.com`);
    expect(fake.status).toBe(200);
    expect(fake.body).toEqual(real.body);
    await sleep(300);
    expect(outbox).toHaveLength(0);
  });

  it('does not email a deactivated account, or an owner who has not confirmed their address', async () => {
    await User.updateOne({ _id: t.trainer._id }, { isActive: false });
    await askStaff(t.trainer.email);
    await User.updateOne({ _id: t.trainer._id }, { isActive: true });
    await User.updateOne({ _id: other.admin._id }, { emailVerified: false });
    await askStaff(other.admin.email);
    await User.updateOne({ _id: other.admin._id }, { emailVerified: true });
    await sleep(300);
    expect(outbox).toHaveLength(0);
  });

  it('sends at most one email a minute for an account, and a newer link replaces the older one', async () => {
    await User.updateOne({ _id: t.admin._id }, { $unset: { passwordResetRequestedAt: 1 } });
    await askStaff(t.admin.email);
    await askStaff(t.admin.email);
    await askStaff(t.admin.email);
    const mails = await waitForMail(t.admin.email, RESET);
    await sleep(200);
    expect(mailsTo(t.admin.email, RESET)).toHaveLength(1);
    expect(mails).toHaveLength(1);
    // after the minute, a new request issues a new link and the old one stops working
    const first = tokenFrom(mails[0]);
    await User.updateOne({ _id: t.admin._id }, { passwordResetRequestedAt: new Date(Date.now() - 2 * 60000) });
    outbox.length = 0;
    await askStaff(t.admin.email);
    const second = tokenFrom((await waitForMail(t.admin.email, RESET))[0]);
    expect(second).not.toBe(first);
    expect((await resetStaff(first, NEW_PASSWORD)).status).toBe(400);
  });

  it('refuses a malformed address', async () => {
    expect((await askStaff('not an email')).status).toBe(400);
    expect((await request(app).post('/api/auth/forgot-password').send({})).status).toBe(400);
  });
});

describe('staff: using the link', () => {
  const freshToken = async (user) => {
    await User.updateOne({ _id: user._id }, { $unset: { passwordResetRequestedAt: 1 } });
    outbox.length = 0;
    await askStaff(user.email);
    return tokenFrom((await waitForMail(user.email, RESET))[0]);
  };

  it('sets the new password, once, and signs everyone out', async () => {
    const before = await request(app).post('/api/auth/login').send({ email: t.manager.email, password: PASSWORD });
    expect(before.status).toBe(200);
    const oldAccess = before.body.token;
    await sleep(1100); // a token minted in the same second as the reset survives by design, so let a second pass

    const token = await freshToken(t.manager);
    const res = await resetStaff(token, NEW_PASSWORD);
    expect(res.status).toBe(200);

    expect((await request(app).post('/api/auth/login').send({ email: t.manager.email, password: PASSWORD })).status).toBe(401); // old one is gone
    expect((await request(app).post('/api/auth/login').send({ email: t.manager.email, password: NEW_PASSWORD })).status).toBe(200);
    expect((await request(app).get('/api/auth/me').set(auth(oldAccess))).status).toBe(401); // an earlier session is ended
    expect((await resetStaff(token, 'Another-Harbor-55!')).status).toBe(400); // the link works once
    await waitForMail(t.manager.email, /password was changed/i);
    expect(mailsTo(t.manager.email, /password was changed/i)).toHaveLength(1); // and they are told
    const log = await AuditLog.findOne({ action: 'PASSWORD_RESET_BY_EMAIL', actorId: t.manager._id });
    expect(log).toBeTruthy();
    await User.findById(t.manager._id).then((u) => { u.password = PASSWORD; return u.save(); });
  });

  it('refuses an unknown, malformed or expired link', async () => {
    expect((await resetStaff('a'.repeat(64), NEW_PASSWORD)).body.code).toBe('LINK_INVALID');
    expect((await resetStaff('short', NEW_PASSWORD)).status).toBe(400);
    const token = await freshToken(t.trainer);
    await User.updateOne({ _id: t.trainer._id }, { passwordResetTokenExpires: new Date(Date.now() - 1000) });
    const res = await resetStaff(token, NEW_PASSWORD);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('LINK_INVALID');
  });

  it('refuses a weak password without using up the link', async () => {
    const token = await freshToken(t.trainer);
    const weak = await resetStaff(token, 'password123');
    expect(weak.status).toBe(400);
    const personal = await resetStaff(token, `${t.trainer.email.split('@')[0]}-2026`);
    expect(personal.status).toBe(400);
    expect((await resetStaff(token, 'abc')).status).toBe(400);
    expect((await resetStaff(token, NEW_PASSWORD)).status).toBe(200); // the same link still works
  });

  it('lifts a sign-in lock, since the person has proved who they are', async () => {
    for (let i = 0; i < 5; i += 1) await request(app).post('/api/auth/login').send({ email: t.admin.email, password: 'Wrong-Guess-1!' });
    expect((await request(app).post('/api/auth/login').send({ email: t.admin.email, password: PASSWORD })).status).toBe(429);
    const token = await freshToken(t.admin);
    expect((await resetStaff(token, NEW_PASSWORD)).status).toBe(200);
    expect((await request(app).post('/api/auth/login').send({ email: t.admin.email, password: NEW_PASSWORD })).status).toBe(200);
  });
});

describe('members', () => {
  let m1; let m2; let me; let noEmail; let twinA; let twinB;
  const shared = `family-${Date.now()}@example.com`;

  beforeAll(async () => {
    m1 = await seedTenant('forgot-members');
    m2 = await seedTenant('forgot-members-other');
    const mk = (tenant, name, phone) => createMember(tenant.managerToken, { branchId: tenant.branch._id.toString(), planId: tenant.plan._id.toString(), name, phone });
    me = await mk(m1, 'Reset Member', '9690000001');
    noEmail = await mk(m1, 'No Email Member', '9690000002');
    twinA = await mk(m1, 'Twin A', '9690000003');
    twinB = await mk(m2, 'Twin B', '9690000004');
    await Member.updateOne({ _id: me._id }, { email: 'reset.member@example.com' });
    await Member.updateOne({ _id: twinA._id }, { email: shared });
    await Member.updateOne({ _id: twinB._id }, { email: shared });
  }, 90000);

  const signIn = async (member, password) => request(app).post('/api/member-auth/login').send({ identifier: member.memberCode, password });
  const getToken = async (member) => {
    await Member.updateOne({ _id: member._id }, { $unset: { passwordResetRequestedAt: 1 } });
    outbox.length = 0;
  };

  it('emails a link to a member who has an email, found by member ID or by email', async () => {
    await getToken(me);
    const a = await askMember(me.memberCode);
    expect(a.status).toBe(200);
    const [mail] = await waitForMail('reset.member@example.com', RESET);
    expect(mail.text).toMatch(/\/member\/reset-password\?token=[0-9a-f]{64}/);
    expect(mail.text).toContain(me.memberCode);
    await getToken(me);
    await askMember('RESET.member@example.com');
    expect((await waitForMail('reset.member@example.com', RESET))).toHaveLength(1);
  });

  it('answers the same for a member with no email, or no such member, and sends nothing', async () => {
    outbox.length = 0;
    const real = await askMember(me.memberCode);
    outbox.length = 0;
    const none = await askMember(noEmail.memberCode);
    const ghost = await askMember('GYM-DOESNOTEXIST');
    expect(none.body).toEqual(ghost.body);
    expect(none.body.message).toMatch(/front desk/);
    expect(real.status).toBe(200);
    await sleep(300);
    expect(outbox).toHaveLength(0);
  });

  it('lets the member choose a new password with the link, and signs their phones out', async () => {
    const access = await request(app).post(`/api/members/${me._id}/app-access`).set(auth(m1.managerToken));
    const session = await request(app).post('/api/member-auth/login').send({ identifier: me.memberCode, password: access.body.password });
    expect(session.status).toBe(200);
    await sleep(1100); // a token minted in the same second as the reset survives by design, so let a second pass
    await getToken(me);
    await askMember(me.memberCode);
    const token = tokenFrom((await waitForMail('reset.member@example.com', RESET))[0]);
    expect((await resetMember(token, NEW_PASSWORD)).status).toBe(200);
    expect((await signIn(me, NEW_PASSWORD)).status).toBe(200);
    expect((await request(app).get('/api/member-app/me').set(auth(session.body.token))).status).toBe(401); // earlier session ended
    expect((await resetMember(token, 'Another-Harbor-55!')).status).toBe(400);
  });

  it('refuses weak passwords and bad links for members too', async () => {
    await getToken(me);
    await askMember(me.memberCode);
    const token = tokenFrom((await waitForMail('reset.member@example.com', RESET))[0]);
    expect((await resetMember(token, 'password')).status).toBe(400);
    expect((await resetMember('b'.repeat(64), NEW_PASSWORD)).body.code).toBe('LINK_INVALID');
    expect((await resetMember('nope', NEW_PASSWORD)).status).toBe(400);
  });

  it('keeps staff and member links apart', async () => {
    await getToken(me);
    await askMember(me.memberCode);
    const memberToken = tokenFrom((await waitForMail('reset.member@example.com', RESET))[0]);
    expect((await resetStaff(memberToken, NEW_PASSWORD)).status).toBe(400); // a member's link cannot reset a staff account
    await User.updateOne({ _id: t.admin._id }, { $unset: { passwordResetRequestedAt: 1 } });
    outbox.length = 0;
    await askStaff(t.admin.email);
    const staffToken = tokenFrom((await waitForMail(t.admin.email, RESET))[0]);
    expect((await resetMember(staffToken, NEW_PASSWORD)).status).toBe(400);
  });

  it('emails each person who shares an address, each with their own link', async () => {
    await Member.updateMany({ _id: { $in: [twinA._id, twinB._id] } }, { $unset: { passwordResetRequestedAt: 1 } });
    outbox.length = 0;
    await askMember(shared);
    await sleep(400);
    const mails = mailsTo(shared, RESET);
    expect(mails).toHaveLength(2);
    expect(new Set(mails.map(tokenFrom)).size).toBe(2);
    expect(mails.map((m) => m.text).join(' ')).toContain(twinA.memberCode);
    expect(mails.map((m) => m.text).join(' ')).toContain(twinB.memberCode);
  });
});
