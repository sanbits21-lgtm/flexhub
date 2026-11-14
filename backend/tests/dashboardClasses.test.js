const { app, request, connect, disconnect, seedTenant, createMember, auth } = require('./helpers');
const ClassType = require('../models/ClassType');
const ClassSession = require('../models/ClassSession');
const Booking = require('../models/Booking');

// The dashboard's class cards: bookings this month, the next sessions with how full they are, and the activities offered.

let t;
let other;
const hour = 3600000;

beforeAll(async () => {
  await connect();
  t = await seedTenant('cls');
  other = await seedTenant('clsother');
  const type = await ClassType.create({ tenantId: t.tenant._id, name: 'Yoga', durationMinutes: 60, defaultCapacity: 2 });
  await ClassType.create({ tenantId: t.tenant._id, name: 'Retired', durationMinutes: 30, defaultCapacity: 5, isActive: false });
  const mk = (session, status) => ClassSession.create({
    tenantId: t.tenant._id, branchId: t.branch._id, classTypeId: type._id, startAt: new Date(Date.now() + session * hour),
    endAt: new Date(Date.now() + (session + 1) * hour), capacity: 2, status,
  });
  const soon = await mk(2, 'scheduled');
  await mk(5, 'scheduled');
  await mk(-30, 'scheduled'); // already started: not "upcoming"
  await mk(8, 'cancelled'); // cancelled: not "upcoming"
  const m1 = await createMember(t.managerToken, { branchId: t.branch._id.toString(), planId: t.plan._id.toString(), name: 'A', phone: '9700200001' });
  const m2 = await createMember(t.managerToken, { branchId: t.branch._id.toString(), planId: t.plan._id.toString(), name: 'B', phone: '9700200002' });
  const book = (m, status) => Booking.create({ tenantId: t.tenant._id, branchId: t.branch._id, classSessionId: soon._id, memberId: m._id, status });
  await book(m1, 'booked');
  await book(m2, 'cancelled');
  // Another gym's class must never leak into this gym's dashboard.
  const otherType = await ClassType.create({ tenantId: other.tenant._id, name: 'Secret Boxing', durationMinutes: 60, defaultCapacity: 5 });
  await ClassSession.create({
    tenantId: other.tenant._id, branchId: other.branch._id, classTypeId: otherType._id,
    startAt: new Date(Date.now() + hour), endAt: new Date(Date.now() + 2 * hour), capacity: 5,
  });
}, 120000);
afterAll(disconnect);

describe('dashboard class cards', () => {
  it('lists the next scheduled sessions, soonest first, with live booking counts', async () => {
    const res = await request(app).get('/api/dashboard/summary').set(auth(t.adminToken));
    expect(res.status).toBe(200);
    expect(res.body.upcomingSessions.map((s) => s.name)).toEqual(['Yoga', 'Yoga']);
    expect(res.body.upcomingSessions[0]).toMatchObject({ capacity: 2, booked: 1, branchName: t.branch.name });
    expect(res.body.upcomingSessions[1].booked).toBe(0);
  });

  it('counts only live bookings this month, and returns a six-month series', async () => {
    const res = await request(app).get('/api/dashboard/summary').set(auth(t.adminToken));
    expect(res.body.bookingsThisMonth).toBe(1);
    expect(res.body.bookingsByMonth).toHaveLength(6);
  });

  it('lists active activities only', async () => {
    const res = await request(app).get('/api/dashboard/summary').set(auth(t.adminToken));
    expect(res.body.activities.map((a) => a.name)).toEqual(['Yoga']);
  });

  it('gives a branch manager the same cards for their branch', async () => {
    const res = await request(app).get('/api/dashboard/summary').set(auth(t.managerToken));
    expect(res.status).toBe(200);
    expect(res.body.upcomingSessions).toHaveLength(2);
    expect(res.body.bookingsThisMonth).toBe(1);
  });

  it("never shows another gym's classes", async () => {
    const res = await request(app).get('/api/dashboard/summary').set(auth(t.adminToken));
    expect(JSON.stringify(res.body)).not.toContain('Secret Boxing');
    const theirs = await request(app).get('/api/dashboard/summary').set(auth(other.adminToken));
    expect(theirs.body.upcomingSessions.map((s) => s.name)).toEqual(['Secret Boxing']);
  });

  it('is empty, not an error, for a gym with no classes', async () => {
    const empty = await seedTenant('clsempty');
    const res = await request(app).get('/api/dashboard/summary').set(auth(empty.adminToken));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ upcomingSessions: [], activities: [], bookingsThisMonth: 0 });
  });
});
