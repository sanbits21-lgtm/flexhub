const { app, request, connect, disconnect, seedTenant, createMember, auth } = require('./helpers');
const Branch = require('../models/Branch');
const Member = require('../models/Member');
const Tenant = require('../models/Tenant');
const Announcement = require('../models/Announcement');
const AnnouncementRead = require('../models/AnnouncementRead');
const { audienceFilter, branchFilter, reaches, renewalReminder } = require('../utils/notices');

// Notices to members: who publishes, who reads, and the automatic renewal reminder.

const day = 86400000;
let t; let other; let north;
let mainActive; let mainExpiring; let mainExpired; let northActive; let otherMember;
let tokens = {};
const accessOf = {};

const post = (token, url, body) => request(app).post(url).set(auth(token)).send(body);
const get = (token, url) => request(app).get(url).set(auth(token));
const publish = (token, body) => post(token, '/api/announcements', { title: 'Title', body: 'Body', ...body });
const inbox = async (who) => (await get(tokens[who], '/api/member-app/notices')).body;

const memberWithApp = async (managerToken, tenant, branchId, planId, name, phone) => {
  const m = await createMember(managerToken, { branchId: branchId.toString(), planId: planId.toString(), name, phone });
  const access = await post(managerToken, `/api/members/${m._id}/app-access`);
  accessOf[m._id] = access.body;
  const login = await request(app).post('/api/member-auth/login').send({ identifier: access.body.memberCode, password: access.body.password });
  return { member: m, token: login.body.token };
};

beforeAll(async () => {
  await connect();
  t = await seedTenant('ntc');
  other = await seedTenant('ntcother');
  north = await Branch.create({ tenantId: t.tenant._id, name: 'North' });
  const make = async (key, branch, name, phone, mgr = t.managerToken) => {
    const r = await memberWithApp(mgr, t.tenant, branch._id, t.plan._id, name, phone);
    tokens[key] = r.token;
    return r.member;
  };
  mainActive = await make('mainActive', t.branch, 'Asha Active', '9810000001');
  mainExpiring = await make('mainExpiring', t.branch, 'Ben Expiring', '9810000002');
  mainExpired = await make('mainExpired', t.branch, 'Cara Expired', '9810000003');
  northActive = await make('northActive', north, 'Dev North', '9810000004', t.adminToken);
  const o = await memberWithApp(other.managerToken, other.tenant, other.branch._id, other.plan._id, 'Eve Other', '9810000005');
  otherMember = o.member;
  tokens.otherMember = o.token;
  await Member.updateOne({ _id: mainActive._id }, { membershipEnd: new Date(Date.now() + 90 * day) });
  await Member.updateOne({ _id: mainExpiring._id }, { membershipEnd: new Date(Date.now() + 2 * day) });
  await Member.updateOne({ _id: mainExpired._id }, { membershipEnd: new Date(Date.now() - 5 * day) });
  await Member.updateOne({ _id: northActive._id }, { membershipEnd: new Date(Date.now() + 90 * day) });
}, 180000);
afterAll(disconnect);

describe('who a notice reaches: the count and the member view always agree', () => {
  const audiences = [
    { type: 'everyone' }, { type: 'active' }, { type: 'expired' }, { type: 'expiring', days: 7 }, { type: 'expiring', days: 1 },
  ];
  it.each(audiences.map((a) => [JSON.stringify(a), a]))('%s', async (_name, audience) => {
    for (const branchIds of [[], [t.branch._id], [north._id]]) {
      const now = new Date();
      const counted = await Member.countDocuments({ tenantId: t.tenant._id, isActive: true, ...branchFilter(branchIds), ...audienceFilter(audience, now) });
      const members = await Member.find({ tenantId: t.tenant._id, isActive: true }).lean();
      const decided = members.filter((m) => reaches({ branchIds, audience }, m, now)).length;
      expect(decided).toBe(counted);
    }
  });

  it('a plan audience matches by plan', async () => {
    const audience = { type: 'plan', planId: t.plan._id };
    const now = new Date();
    const counted = await Member.countDocuments({ tenantId: t.tenant._id, isActive: true, ...audienceFilter(audience, now) });
    const members = await Member.find({ tenantId: t.tenant._id, isActive: true }).lean();
    expect(members.filter((m) => reaches({ branchIds: [], audience }, m, now)).length).toBe(counted);
    expect(counted).toBeGreaterThan(0);
  });
});

describe('publishing', () => {
  it('the owner can publish to the whole gym or to chosen branches', async () => {
    const all = await publish(t.adminToken, { title: 'Gym-wide', kind: 'offer' });
    expect(all.status).toBe(201);
    expect(all.body.branchIds).toEqual([]);
    const one = await publish(t.adminToken, { title: 'North only', branchIds: [north._id.toString()] });
    expect(one.body.branchIds).toEqual([north._id.toString()]);
  });

  it("a manager's notice always stays in their own branch, whatever they ask for", async () => {
    const res = await publish(t.managerToken, { title: 'Main manager notice', branchIds: [north._id.toString()] });
    expect(res.status).toBe(201);
    expect(res.body.branchIds).toEqual([t.branch._id.toString()]);
  });

  it('trainers and members cannot publish', async () => {
    expect((await publish(t.trainerToken, {})).status).toBe(403);
    expect((await request(app).post('/api/announcements').set(auth(tokens.mainActive)).send({ title: 'x', body: 'y' })).status).toBe(403);
  });

  it('refuses bad input: no title, a long body, a non-https link, another gym\'s branch or plan, an end before the start', async () => {
    expect((await publish(t.adminToken, { title: '' })).status).toBe(400);
    expect((await publish(t.adminToken, { body: 'x'.repeat(1001) })).status).toBe(400);
    expect((await publish(t.adminToken, { link: 'javascript:alert(1)' })).status).toBe(400);
    expect((await publish(t.adminToken, { link: 'http://example.com' })).status).toBe(400);
    expect((await publish(t.adminToken, { branchIds: [other.branch._id.toString()] })).status).toBe(400);
    expect((await publish(t.adminToken, { audience: { type: 'plan', planId: other.plan._id.toString() } })).status).toBe(400);
    expect((await publish(t.adminToken, { audience: { type: 'plan' } })).status).toBe(400);
    expect((await publish(t.adminToken, { startsAt: new Date(Date.now() + day).toISOString(), expiresAt: new Date().toISOString() })).status).toBe(400);
  });

  it('shows how many members a notice will reach before publishing', async () => {
    const count = (body) => post(t.adminToken, '/api/announcements/preview', body).then((r) => r.body.count);
    expect(await count({})).toBe(4);
    expect(await count({ branchIds: [north._id.toString()] })).toBe(1);
    expect(await count({ audience: { type: 'expiring', days: 7 } })).toBe(1);
    expect(await count({ audience: { type: 'expired' } })).toBe(1);
    expect(await count({ audience: { type: 'active' } })).toBe(3); // the one ending in two days is still active
    expect((await post(t.adminToken, '/api/announcements/preview', { branchIds: [other.branch._id.toString()] })).status).toBe(400);
    expect((await post(t.managerToken, '/api/announcements/preview', { branchIds: [north._id.toString()] })).body.count).toBe(3); // forced to the main branch
  });

  it("lists notices with their reach and read counts, and lets a manager change only their own", async () => {
    const list = (await get(t.managerToken, '/api/announcements')).body;
    const titles = list.map((n) => n.title);
    expect(titles).toContain('Gym-wide'); // reaches their branch
    expect(titles).toContain('Main manager notice');
    expect(titles).not.toContain('North only'); // another branch
    const adminOwned = list.find((n) => n.title === 'Gym-wide');
    expect(adminOwned.canManage).toBe(false);
    expect((await post(t.managerToken, `/api/announcements/${adminOwned._id}/withdraw`)).status).toBe(403);
    const mine = list.find((n) => n.title === 'Main manager notice');
    expect(mine.canManage).toBe(true);
    expect(mine.stage).toBe('live');
    expect(mine.reach).toBe(3);
  });
});

describe('what a member sees', () => {
  beforeAll(async () => {
    await publish(t.adminToken, { title: 'Expiring heads-up', audience: { type: 'expiring', days: 7 } });
    await publish(t.adminToken, { title: 'For the lapsed', audience: { type: 'expired' } });
    await publish(t.adminToken, { title: 'Scheduled', startsAt: new Date(Date.now() + 3 * day).toISOString() });
    const gone = (await publish(t.adminToken, { title: 'Withdrawn one' })).body;
    await post(t.adminToken, `/api/announcements/${gone._id}/withdraw`);
    await Announcement.create({ tenantId: t.tenant._id, title: 'Ended', body: 'b', startsAt: new Date(Date.now() - 3 * day), expiresAt: new Date(Date.now() - day), branchIds: [] });
    await publish(other.adminToken, { title: 'Other gym secret' });
  });
  const titles = async (who) => (await inbox(who)).items.map((i) => i.title);

  it('gets the notices meant for them: their branch, their status', async () => {
    const main = await titles('mainActive');
    expect(main).toEqual(expect.arrayContaining(['Gym-wide', 'Main manager notice']));
    expect(main).not.toContain('North only');
    expect(main).not.toContain('Expiring heads-up');
    expect(main).not.toContain('For the lapsed');
    expect(await titles('mainExpiring')).toContain('Expiring heads-up');
    expect(await titles('mainExpired')).toContain('For the lapsed');
    const north_ = await titles('northActive');
    expect(north_).toContain('North only');
    expect(north_).not.toContain('Main manager notice');
  });

  it("never gets a notice that is scheduled, withdrawn, ended, or another gym's", async () => {
    for (const who of ['mainActive', 'northActive', 'mainExpiring']) {
      const seen = await titles(who);
      for (const hidden of ['Scheduled', 'Withdrawn one', 'Ended', 'Other gym secret']) expect(seen).not.toContain(hidden);
    }
    expect(await titles('otherMember')).toEqual(['Other gym secret']);
  });

  it('counts unread, marks one read, and marks all read', async () => {
    const first = await inbox('mainActive');
    expect(first.unread).toBe(first.items.length);
    const target = first.items[0];
    expect((await post(tokens.mainActive, `/api/member-app/notices/${target.id}/read`, {})).status).toBe(200);
    expect((await post(tokens.mainActive, `/api/member-app/notices/${target.id}/read`, {})).status).toBe(200); // twice is fine
    const second = await inbox('mainActive');
    expect(second.unread).toBe(first.items.length - 1);
    expect(second.items.find((i) => i.id === target.id).read).toBe(true);
    expect(await AnnouncementRead.countDocuments({ memberId: mainActive._id, announcementId: target.id })).toBe(1);
    await post(tokens.mainActive, '/api/member-app/notices/read-all', {});
    expect((await inbox('mainActive')).unread).toBe(0);
  });

  it('cannot mark a notice it is not meant to see, of another branch or gym', async () => {
    const northOnly = await Announcement.findOne({ tenantId: t.tenant._id, title: 'North only' });
    expect((await post(tokens.mainActive, `/api/member-app/notices/${northOnly._id}/read`, {})).status).toBe(404);
    const secret = await Announcement.findOne({ title: 'Other gym secret' });
    expect((await post(tokens.mainActive, `/api/member-app/notices/${secret._id}/read`, {})).status).toBe(404);
    expect((await post(tokens.mainActive, '/api/member-app/notices/not-an-id/read', {})).status).toBe(404);
  });

  it('staff cannot use the member routes', async () => {
    expect((await get(t.adminToken, '/api/member-app/notices')).status).toBe(403);
  });

  it('an empty inbox when the gym has switched the feature off', async () => {
    await Tenant.updateOne({ _id: other.tenant._id }, { $set: { 'features.features:announcements': false } });
    expect(await inbox('otherMember')).toEqual({ items: [], unread: 0 });
    expect((await get(other.adminToken, '/api/announcements')).status).toBe(403);
  });
});

describe('editing and withdrawing', () => {
  it('can change the text and the end date, then withdraw it, and it leaves members\' inboxes', async () => {
    const n = (await publish(t.adminToken, { title: 'Editable' })).body;
    const edited = await request(app).put(`/api/announcements/${n._id}`).set(auth(t.adminToken)).send({ title: 'Edited', expiresAt: new Date(Date.now() + 5 * day).toISOString() });
    expect(edited.body.title).toBe('Edited');
    expect((await inbox('mainActive')).items.map((i) => i.title)).toContain('Edited');
    expect((await request(app).put(`/api/announcements/${n._id}`).set(auth(t.adminToken)).send({ expiresAt: new Date(Date.now() - 10 * day).toISOString() })).status).toBe(400);
    await post(t.adminToken, `/api/announcements/${n._id}/withdraw`);
    expect((await inbox('mainActive')).items.map((i) => i.title)).not.toContain('Edited');
  });

  it("another gym's staff cannot see or change it", async () => {
    const n = await Announcement.findOne({ tenantId: t.tenant._id, title: 'Gym-wide' });
    // other gym has the feature off by now, so switch it back on for this check
    await Tenant.updateOne({ _id: other.tenant._id }, { $set: { 'features.features:announcements': true } });
    expect((await get(other.adminToken, '/api/announcements')).body.map((x) => x.title)).not.toContain('Gym-wide');
    expect((await request(app).put(`/api/announcements/${n._id}`).set(auth(other.adminToken)).send({ title: 'Hijacked' })).status).toBe(404);
    expect((await post(other.adminToken, `/api/announcements/${n._id}/withdraw`)).status).toBe(404);
  });
});

describe('the automatic renewal reminder', () => {
  const reminderOf = async (who) => (await inbox(who)).items.find((i) => i.auto);
  const settings = (body) => request(app).put('/api/announcements/reminders').set(auth(t.adminToken)).send(body);

  it('is off until the owner turns it on, and only the owner can', async () => {
    expect(await reminderOf('mainExpiring')).toBeUndefined();
    expect((await get(t.managerToken, '/api/announcements/reminders')).status).toBe(403);
    expect((await request(app).put('/api/announcements/reminders').set(auth(t.managerToken)).send({ enabled: true })).status).toBe(403);
    const view = (await get(t.adminToken, '/api/announcements/reminders')).body;
    expect(view).toMatchObject({ enabled: false, daysBefore: [7, 3, 1] });
    expect(view.defaults.expiringText).toContain('{name}');
  });

  it('then reminds a member whose membership ends soon, in their own words, and one who has lapsed', async () => {
    expect((await settings({ enabled: true, daysBefore: [7, 3, 1] })).body.enabled).toBe(true);
    const soon = await reminderOf('mainExpiring');
    expect(soon).toMatchObject({ kind: 'reminder', read: false });
    expect(soon.title).toBe('Your membership ends soon');
    expect(soon.body).toContain('Ben');
    expect(soon.body).toMatch(/2 days left/);
    const lapsed = await reminderOf('mainExpired');
    expect(lapsed.title).toBe('Your membership has ended');
    expect(await reminderOf('mainActive')).toBeUndefined(); // 90 days away
    expect(await reminderOf('otherMember')).toBeUndefined(); // another gym, which has not turned it on
    expect((await inbox('mainExpiring')).unread).toBeGreaterThan(0);
  });

  it('uses the gym\'s own wording, and stops the moment the member renews', async () => {
    await settings({ enabled: true, expiringText: 'Hey {name}! {days} to go.' });
    expect((await reminderOf('mainExpiring')).body).toBe('Hey Ben! 2 days left to go.');
    await Member.updateOne({ _id: mainExpiring._id }, { membershipEnd: new Date(Date.now() + 60 * day) });
    expect(await reminderOf('mainExpiring')).toBeUndefined();
  });

  it('refuses silly settings', async () => {
    expect((await settings({ enabled: true, daysBefore: [] })).status).toBe(400);
    expect((await settings({ enabled: true, daysBefore: [1, 2, 3, 4, 5] })).status).toBe(400);
    expect((await settings({ enabled: true, daysBefore: [400] })).status).toBe(400);
    expect((await settings({ enabled: 'yes' })).status).toBe(400);
  });

  it('the rule on its own: only active or expired members, and never one with no end date', () => {
    const cfg = { enabled: true, daysBefore: [3] };
    const now = new Date();
    expect(renewalReminder(cfg, { name: 'A B', membershipStatus: 'frozen', membershipEnd: new Date(now - day) }, now)).toBeNull();
    expect(renewalReminder(cfg, { name: 'A B', membershipStatus: 'active', membershipEnd: null }, now)).toBeNull();
    expect(renewalReminder(cfg, { name: 'A B', membershipStatus: 'active', membershipEnd: new Date(+now + 5 * day) }, now)).toBeNull(); // outside the window
    expect(renewalReminder(cfg, { name: 'A B', membershipStatus: 'active', membershipEnd: new Date(+now + 2 * day) }, now)).toMatchObject({ auto: true });
    expect(renewalReminder({ enabled: false }, { name: 'A', membershipStatus: 'active', membershipEnd: new Date(+now + day) }, now)).toBeNull();
  });
});

describe('deleting a member account', () => {
  it('removes what they have read', async () => {
    const m = await memberWithApp(t.managerToken, t.tenant, t.branch._id, t.plan._id, 'Gone Soon', '9810000099');
    await post(m.token, '/api/member-app/notices/read-all', {});
    expect(await AnnouncementRead.countDocuments({ memberId: m.member._id })).toBeGreaterThan(0);
    const del = await request(app).delete('/api/member-app/me').set(auth(m.token)).send({ password: accessOf[m.member._id].password });
    expect(del.status).toBe(200);
    expect(await AnnouncementRead.countDocuments({ memberId: m.member._id })).toBe(0);
  });
});
