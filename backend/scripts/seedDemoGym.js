#!/usr/bin/env node
/**
 * Seeds a realistic demo gym, "FitzyClub", with six months of history: members joining, renewing and lapsing, the payments for
 * every term, daily attendance, classes with bookings, personal training, expenses and payroll, equipment, notices and ratings.
 * Everyone in it is fictional.
 *
 *   node backend/scripts/seedDemoGym.js            create it (stops if it already exists)
 *   node backend/scripts/seedDemoGym.js --reset    empty the demo database first, then create it
 *
 * SAFETY: it writes only to a database whose name ends in "-demo". By default that is your MONGODB_URI database with "-demo"
 * added (a separate database on the same cluster); set MONGODB_URI_DEMO to choose another. It refuses any other name, so it can
 * never touch your real data. The same random seed is used every time, so the same data comes out.
 *
 * Records are written straight to the collections (no save hooks), which keeps a few thousand rows quick over a network.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { addPlanDuration } = require('../utils/planDuration');

const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'FitzyDemo#2026';
const SLUG = 'fitzyclub-gym';

// ---- the database guard -------------------------------------------------------------------------------------------
const demoUri = () => {
  if (process.env.MONGODB_URI_DEMO) return process.env.MONGODB_URI_DEMO;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  return uri.replace(/\/([^/?]+)(\?|$)/, '/$1-demo$2');
};

// ---- a small repeatable random generator --------------------------------------------------------------------------
let state = 20261121;
const rnd = () => { state = (state + 0x6D2B79F5) | 0; let t = Math.imul(state ^ (state >>> 15), 1 | state); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const between = (a, b) => a + rnd() * (b - a);
const int = (a, b) => Math.floor(between(a, b + 1));
const pick = (list) => list[Math.floor(rnd() * list.length)];
const chance = (p) => rnd() < p;
const weighted = (pairs) => { let r = rnd() * pairs.reduce((s, [, w]) => s + w, 0); for (const [v, w] of pairs) { r -= w; if (r <= 0) return v; } return pairs[pairs.length - 1][0]; };
const shuffle = (list) => { const a = [...list]; for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const oid = () => new mongoose.Types.ObjectId();
const DAY = 86400000;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getTime() + n * DAY);
const atTime = (d, h, m = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, int(0, 59));
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const rupees = (n, step = 10) => Math.round(n / step) * step;

// ---- people and places --------------------------------------------------------------------------------------------
const MALE = ['Aarav', 'Vihaan', 'Arjun', 'Rohan', 'Kabir', 'Karthik', 'Rahul', 'Aditya', 'Siddharth', 'Nikhil', 'Pranav', 'Varun', 'Harsha', 'Manoj', 'Suresh', 'Naveen', 'Deepak', 'Ganesh', 'Imran', 'Anil', 'Vikram', 'Sandeep', 'Ashwin', 'Mohan', 'Prakash'];
const FEMALE = ['Diya', 'Ananya', 'Meera', 'Isha', 'Saanvi', 'Priya', 'Neha', 'Sneha', 'Kavya', 'Divya', 'Aishwarya', 'Pooja', 'Lakshmi', 'Anjali', 'Shreya', 'Nandini', 'Swathi', 'Rekha', 'Bhavana', 'Sowmya', 'Tanvi', 'Ritu', 'Deepa', 'Harini', 'Pavithra'];
const LAST = ['Mehta', 'Nair', 'Iyer', 'Reddy', 'Shah', 'Pillai', 'Rao', 'Kapoor', 'Das', 'Menon', 'Verma', 'Joshi', 'Gowda', 'Singh', 'Hegde', 'Shetty', 'Bhat', 'Naik', 'Kulkarni', 'Patil', 'Sharma', 'Gupta', 'Krishnan', 'Raman', 'Murthy', 'Prasad', 'Sheikh', 'Khan', 'Fernandes', 'Thomas'];
const fullName = (gender) => `${pick(gender === 'female' ? FEMALE : MALE)} ${pick(LAST)}`;
const uniqueEmail = (() => { const used = new Set(); return (name) => { let e; let n = int(1, 99); do { e = `${name.toLowerCase().replace(/\s+/g, '.')}${n}@example.com`; n += 1; } while (used.has(e)); used.add(e); return e; }; })();
const phone = (() => { const used = new Set(); return () => { let p; do { p = `${pick([98, 97, 96, 94, 99, 90, 88, 81])}${String(int(10000000, 99999999))}`; } while (used.has(p)); used.add(p); return p; }; })();

const BRANCHES = [
  { name: 'Indiranagar', line1: '100 Feet Road, Indiranagar', postalCode: '560038', share: 0.45, rent: 60000, power: 18000 },
  { name: 'Koramangala', line1: '80 Feet Road, 4th Block, Koramangala', postalCode: '560034', share: 0.33, rent: 48000, power: 14000 },
  { name: 'Whitefield', line1: 'ITPL Main Road, Whitefield', postalCode: '560066', share: 0.22, rent: 40000, power: 12000 },
];
const STAFF = [
  { branch: 0, role: 'branch-manager', name: 'Meenakshi Rao', salary: 30000 },
  { branch: 1, role: 'branch-manager', name: 'Farhan Qureshi', salary: 28000 },
  { branch: 2, role: 'branch-manager', name: 'Latha Srinivas', salary: 26000 },
  { branch: 0, role: 'trainer', name: 'Karthik Shetty', salary: 34000, specialization: 'Strength and conditioning' },
  { branch: 0, role: 'trainer', name: 'Divya Menon', salary: 28000, specialization: 'Yoga and Zumba' },
  { branch: 0, role: 'trainer', name: 'Arun Prasad', salary: 24000, specialization: 'HIIT and fat loss' },
  { branch: 1, role: 'trainer', name: 'Sneha Bhat', salary: 26000, specialization: 'Yoga and mobility' },
  { branch: 1, role: 'trainer', name: 'Imran Sheikh', salary: 32000, specialization: 'Powerlifting' },
  { branch: 2, role: 'trainer', name: 'Rahul Naik', salary: 22000, specialization: 'Functional training' },
  { branch: 2, role: 'trainer', name: 'Pooja Hegde', salary: 24000, specialization: 'Dance fitness' },
];
const PAYEES = [
  { branch: 0, name: 'Meena S', roleLabel: 'Receptionist', monthlySalary: 16000 },
  { branch: 0, name: 'Suresh K', roleLabel: 'Housekeeping', monthlySalary: 12000 },
  { branch: 1, name: 'Anita R', roleLabel: 'Receptionist', monthlySalary: 15000 },
  { branch: 2, name: 'Lakshmi N', roleLabel: 'Receptionist', monthlySalary: 14000 },
];
const PLANS = [
  { name: 'Monthly', unit: 'monthly', price: 1800, weight: 38, renew: 0.78 },
  { name: 'Quarterly', unit: 'quarterly', price: 4800, weight: 30, renew: 0.84 },
  { name: 'Half-yearly', unit: 'half_yearly', price: 8400, weight: 17, renew: 0.8 },
  { name: 'Annual', unit: 'yearly', price: 14400, weight: 15, renew: 0.7 },
];
const CLASS_TYPES = [
  { key: 'yoga', name: 'Yoga', description: 'Flow and breathing for strength and calm.', durationMinutes: 60, defaultCapacity: 20 },
  { key: 'zumba', name: 'Zumba', description: 'Dance cardio to Latin and Bollywood beats.', durationMinutes: 45, defaultCapacity: 25 },
  { key: 'hiit', name: 'HIIT', description: 'Short, hard intervals. All levels.', durationMinutes: 45, defaultCapacity: 18 },
  { key: 'spin', name: 'Spin', description: 'Indoor cycling with a coach.', durationMinutes: 45, defaultCapacity: 15 },
  { key: 'strength', name: 'Strength basics', description: 'Learn the big lifts with good form.', durationMinutes: 60, defaultCapacity: 12 },
];
// day of week (0 = Sunday) -> [hour, minute, class]
const TIMETABLE = { 1: [[6, 30, 'yoga'], [18, 30, 'spin']], 2: [[7, 0, 'zumba'], [19, 0, 'hiit']], 3: [[6, 30, 'yoga'], [18, 30, 'strength']], 4: [[7, 0, 'zumba'], [19, 0, 'spin']], 5: [[6, 30, 'yoga'], [18, 30, 'hiit']], 6: [[8, 0, 'zumba'], [9, 15, 'strength']], 0: [[8, 0, 'yoga']] };

// The driver would store a missing optional value as null; leave those fields out instead, as the app does.
const clean = (doc) => Object.fromEntries(Object.entries(doc).filter(([, v]) => v !== undefined));
const insert = async (Model, docs) => {
  const rows = docs.map(clean);
  for (let i = 0; i < rows.length; i += 1000) await Model.collection.insertMany(rows.slice(i, i + 1000), { ordered: false });
  return rows.length;
};

(async () => {
  const uri = demoUri();
  await mongoose.connect(uri);
  const dbName = mongoose.connection.name;
  if (!dbName.endsWith('-demo')) throw new Error(`Refusing to run: the database "${dbName}" does not end in "-demo".`);
  const M = (n) => require(`../models/${n}`);
  const [Tenant, Branch, User, MembershipPlan, Member, MemberPayment, Attendance, ClassType, ClassSession, Booking, PtSession, Expense, Payee, Equipment, Announcement, Rating] = [
    'Tenant', 'Branch', 'User', 'MembershipPlan', 'Member', 'MemberPayment', 'Attendance', 'ClassType', 'ClassSession', 'Booking', 'PtSession', 'Expense', 'Payee', 'Equipment', 'Announcement', 'Rating'].map(M);

  if (process.argv.includes('--reset')) {
    await Promise.all((await mongoose.connection.db.collections()).map((c) => c.deleteMany({})));
    console.log(`Emptied ${dbName}.`);
  } else if (await Tenant.collection.findOne({ slug: SLUG })) {
    console.log(`The demo gym already exists in ${dbName}. Run with --reset to rebuild it.`);
    await mongoose.disconnect();
    return;
  }

  const now = new Date();
  const today = startOfDay(now);
  const windowStart = new Date(today.getFullYear(), today.getMonth() - 5, 1); // the first day of the month five months ago
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const at = (date) => ({ createdAt: date, updatedAt: date });

  // ---- tenant, branches, staff, plans ----
  const tenantId = oid();
  await insert(Tenant, [{
    _id: tenantId, name: 'FitzyClub', slug: SLUG, contactEmail: 'owner@fitzyclub-demo.example.com', contactPhone: '9845000001',
    billingPlan: 'pro', billingStatus: 'active', maxBranches: 5, planEndsAt: addDays(today, 270), signupSource: 'platform', approvalStatus: 'approved',
    approvedAt: windowStart, upiId: 'fitzyclub@okhdfcbank', upiPaymentLink: '', memberAppUrl: '', isActive: true, features: {}, previousSlugs: [], memberFields: [],
    brand: { color: '', color2: '', gradientAngle: 135, logoUrl: '', displayName: '', logoFile: '', tagline: 'Train smarter. Run your gym better.' },
    notices: { reminders: { enabled: true, daysBefore: [7, 3, 1], expiringText: '', expiredText: '' } },
    ...at(addDays(windowStart, -40)),
  }]);

  const branches = BRANCHES.map((b) => ({ ...b, _id: oid() }));
  await insert(Branch, branches.map((b) => ({
    _id: b._id, tenantId, name: b.name, address: { line1: b.line1, city: 'Bengaluru', state: 'Karnataka', postalCode: b.postalCode, country: 'India' },
    phone: `98450${String(int(10000, 99999))}`, timezone: 'Asia/Kolkata', capacity: 150, upiId: '', upiPaymentLink: '', isActive: true, ...at(addDays(windowStart, -40)),
  })));

  const emailOf = (name) => `${name.toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, '.')}@fitzyclub-demo.example.com`;
  const owner = { _id: oid(), name: 'Ravi Kumar', email: 'owner@fitzyclub-demo.example.com', phone: '9845000001', password: passwordHash, role: 'tenant-admin', tenantId, branchId: null, managedTenantIds: [], salary: null, isActive: true, emailVerified: true, lastLoginAt: addDays(now, -0.1), ...at(addDays(windowStart, -40)) };
  const staff = STAFF.map((s) => ({ ...s, _id: oid() }));
  await insert(User, [owner, ...staff.map((s) => ({
    _id: s._id, name: s.name, email: emailOf(s.name), phone: phone(), password: passwordHash, role: s.role, tenantId, branchId: branches[s.branch]._id,
    managedTenantIds: [], specialization: s.specialization, salary: s.salary, isActive: true, emailVerified: true, lastLoginAt: addDays(now, -int(0, 3)), ...at(addDays(windowStart, -30)),
  }))]);
  const trainersOf = (bi) => staff.filter((s) => s.role === 'trainer' && s.branch === bi);
  const payees = PAYEES.map((p) => ({ ...p, _id: oid() }));
  await insert(Payee, payees.map((p) => ({ _id: p._id, tenantId, branchId: branches[p.branch]._id, name: p.name, roleLabel: p.roleLabel, monthlySalary: p.monthlySalary, isActive: true, ...at(windowStart) })));

  const plans = PLANS.map((p) => ({ ...p, _id: oid() }));
  await insert(MembershipPlan, plans.map((p) => ({
    _id: p._id, tenantId, branchIds: [], name: p.name, durationUnit: p.unit, price: p.price, isActive: true,
    description: { monthly: 'Pay as you go, cancel any time.', quarterly: 'Our most popular: three months and a free trainer session.', half_yearly: 'Six months, best for building a habit.', yearly: 'Twelve months at the lowest monthly cost.' }[p.unit],
    features: ['All equipment', 'Group classes', 'Locker'], ...at(windowStart),
  })));

  // ---- members, their terms, and the payment for every term ----
  const memberCount = 640;
  const joinsByMonth = [35, 45, 60, 75, 90, 100]; // growth over the six months; the rest joined before the window
  const joinDates = [];
  joinsByMonth.forEach((n, m) => { for (let i = 0; i < n; i += 1) joinDates.push(addDays(new Date(windowStart.getFullYear(), windowStart.getMonth() + m, 1), int(0, 27))); });
  while (joinDates.length < memberCount) joinDates.push(addDays(windowStart, -int(10, 150))); // earlier members, renewing inside the window
  const shuffledJoins = joinDates.filter((d) => d <= today);

  const members = [];
  const payments = [];
  let invoiceSeq = 1;
  const profileOf = () => weighted([['regular', 35], ['casual', 45], ['rare', 20]]);
  shuffledJoins.forEach((join, idx) => {
    const gender = chance(0.56) ? 'male' : 'female';
    const name = fullName(gender);
    const bi = weighted(branches.map((b, i) => [i, b.share]));
    let plan = weighted(plans.map((p) => [p, p.weight]));
    const terms = [];
    let start = join;
    for (let guard = 0; guard < 12; guard += 1) {
      const end = addPlanDuration(start, plan.unit);
      terms.push({ start, end, plan });
      if (end >= today) break;
      if (!chance(plan.renew)) break;
      start = addDays(end, chance(0.25) ? int(1, 12) : 0); // sometimes a short gap before renewing
      if (start > today) break;
      if (chance(0.2)) plan = weighted(plans.map((p) => [p, p.weight]));
    }
    const last = terms[terms.length - 1];
    const lapsed = last.end < today;
    const status = lapsed ? 'expired' : chance(0.03) ? 'frozen' : 'active';
    const id = oid();
    const trainer = chance(0.7) ? pick(trainersOf(bi)) : null;
    const hasMetrics = chance(0.4);
    const goal = pick(['lose_fat', 'build_muscle', 'stay_fit', 'improve_endurance']);
    let weight = between(58, 96);
    const metrics = hasMetrics ? Array.from({ length: int(3, 6) }, (_, i) => {
      weight += (goal === 'lose_fat' ? -1 : goal === 'build_muscle' ? 0.7 : 0) * between(0.4, 1.4);
      return { date: addDays(join, 28 * i), weightKg: Math.round(weight * 10) / 10, heightCm: 150 + int(0, 40), bodyFatPct: Math.round(between(14, 32) * 10) / 10, source: i === 0 ? 'staff' : 'member' };
    }).filter((m) => m.date <= today) : [];
    members.push({
      _id: id, tenantId, branchId: branches[bi]._id, memberCode: `GYM-${(1000 + idx * 7).toString(36).toUpperCase()}${String(int(1000, 9999))}`, name,
      email: chance(0.7) ? uniqueEmail(name) : undefined, phone: phone(), password: passwordHash,
      dob: new Date(1970 + int(0, 38), int(0, 11), int(1, 28)), gender, emergencyContact: { name: `${pick(LAST)} ${pick(['(spouse)', '(parent)', '(friend)'])}`, phone: phone() },
      membershipPlanId: last.plan._id, membershipStart: last.start, membershipEnd: last.end, membershipStatus: status, bodyMetrics: metrics,
      fitnessGoal: goal, experienceLevel: pick(['beginner', 'beginner', 'intermediate', 'advanced']), dietPreference: pick(['veg', 'veg', 'non_veg', 'eggetarian', 'vegan']),
      assignedTrainerId: trainer ? trainer._id : null, qrCode: `demo-${id.toString()}`, isActive: !(lapsed && chance(0.05) && last.end < addDays(today, -60)),
      ...at(join), _terms: terms, _profile: profileOf(), _bi: bi,
    });
    terms.forEach((t, ti) => {
      const price = t.plan.price;
      const discount = weighted([[0, 80], [0.05, 12], [0.1, 8]]);
      const paidAt = atTime(t.start, int(9, 20), int(0, 59));
      const recent = t.start > addDays(today, -10);
      payments.push({
        _id: oid(), tenantId, branchId: branches[bi]._id, memberId: id, membershipPlanId: t.plan._id, amount: rupees(price * (1 - discount)),
        currency: 'INR', status: recent && chance(0.12) ? 'pending' : chance(0.012) ? 'refunded' : 'paid',
        method: weighted([['upi', 55], ['cash', 28], ['card', 12], ['netbanking', 5]]), invoiceNumber: `INV-D${String(invoiceSeq++).padStart(5, '0')}`,
        paidAt: paidAt > now ? now : paidAt, ...at(paidAt > now ? now : paidAt),
      });
      return ti;
    });
  });
  const memberDocs = members.map(({ _terms, _profile, _bi, ...doc }) => doc);
  await insert(Member, memberDocs);
  await insert(MemberPayment, payments);

  // ---- attendance, day by day, while a member's term runs ----
  const attendance = [];
  const chanceByProfile = { regular: 0.62, casual: 0.33, rare: 0.12 };
  members.forEach((m) => {
    const days = new Set();
    m._terms.forEach((t) => {
      for (let d = startOfDay(t.start); d <= today && d < t.end; d = addDays(d, 1)) {
        if (d < windowStart) continue;
        const p = chanceByProfile[m._profile] * (d.getDay() === 0 ? 0.4 : 1);
        if (!chance(p) || days.has(d.getTime())) continue;
        days.add(d.getTime());
        const morning = chance(0.6);
        const checkIn = morning ? atTime(d, int(5, 9), int(0, 59)) : atTime(d, int(17, 21), int(0, 59));
        if (checkIn > now) continue;
        const out = new Date(checkIn.getTime() + int(40, 110) * 60000);
        attendance.push({
          _id: oid(), tenantId, branchId: branches[m._bi]._id, memberId: m._id, checkInAt: checkIn, checkOutAt: out > now ? null : out,
          method: chance(0.85) ? 'qr' : 'manual', recordedBy: null, ...at(checkIn),
        });
      }
    });
  });
  await insert(Attendance, attendance);

  // ---- classes and bookings ----
  const classTypes = CLASS_TYPES.map((c) => ({ ...c, _id: oid() }));
  await insert(ClassType, classTypes.map((c) => ({ _id: c._id, tenantId, branchId: null, name: c.name, description: c.description, durationMinutes: c.durationMinutes, defaultCapacity: c.defaultCapacity, isActive: true, ...at(windowStart) })));
  const sessions = [];
  const bookings = [];
  const covered = (m, date) => m._terms.some((t) => date >= startOfDay(t.start) && date < t.end) && m._active !== false;
  branches.forEach((branch, bi) => {
    const pool = members.filter((m) => m._bi === bi);
    const coaches = trainersOf(bi);
    let rota = 0;
    for (let d = new Date(windowStart); d <= addDays(today, 14); d = addDays(d, 1)) {
      (TIMETABLE[d.getDay()] || []).forEach(([h, mi, key]) => {
        const type = classTypes.find((c) => c.key === key);
        const startAt = atTime(d, h, mi);
        startAt.setSeconds(0);
        const endAt = new Date(startAt.getTime() + type.durationMinutes * 60000);
        const past = endAt < now;
        const id = oid();
        sessions.push({ _id: id, tenantId, branchId: branch._id, classTypeId: type._id, trainerId: coaches[rota++ % coaches.length]._id, startAt, endAt, capacity: null, status: past ? 'completed' : 'scheduled', ...at(addDays(startAt, -7)) });
        const eligible = shuffle(pool.filter((m) => covered(m, startOfDay(d))));
        const fill = Math.min(eligible.length, Math.round(type.defaultCapacity * (past ? between(0.35, 0.95) : between(0.15, 0.6))));
        eligible.slice(0, fill).forEach((m) => {
          const status = past ? weighted([['attended', 82], ['no-show', 10], ['cancelled', 8]]) : 'booked';
          const bookedAt = addDays(startAt, -between(0.2, 4));
          bookings.push({ _id: oid(), tenantId, branchId: branch._id, classSessionId: id, memberId: m._id, status, bookedAt, bookedBy: null, cancelledAt: status === 'cancelled' ? addDays(startAt, -0.3) : null, markedBy: status === 'attended' || status === 'no-show' ? coaches[0]._id : null, markedAt: status === 'attended' || status === 'no-show' ? endAt : null, ...at(bookedAt) });
        });
      });
    }
  });
  await insert(ClassSession, sessions);
  await insert(Booking, bookings);

  // ---- personal training ----
  const pt = [];
  const trained = members.filter((m) => m.assignedTrainerId && covered(m, today) && chance(0.35));
  trained.forEach((m) => {
    const trainerId = m.assignedTrainerId;
    for (let i = 0; i < int(2, 6); i += 1) {
      const day = addDays(today, -int(1, 150));
      if (day < windowStart || !covered(m, day)) continue;
      const startAt = atTime(day, pick([7, 8, 9, 17, 18, 19]), pick([0, 30]));
      pt.push({ _id: oid(), tenantId, branchId: branches[m._bi]._id, trainerId, memberId: m._id, startAt, endAt: new Date(startAt.getTime() + 3600000), status: weighted([['completed', 80], ['no-show', 8], ['cancelled', 12]]), focus: pick(['Upper body', 'Legs and glutes', 'Fat loss circuit', 'Mobility', 'Strength basics', 'Core']), ...at(addDays(startAt, -3)) });
    }
  });
  trained.slice(0, 12).forEach((m) => {
    const startAt = atTime(addDays(today, int(1, 9)), pick([7, 8, 18, 19]), pick([0, 30]));
    pt.push({ _id: oid(), tenantId, branchId: branches[m._bi]._id, trainerId: m.assignedTrainerId, memberId: m._id, startAt, endAt: new Date(startAt.getTime() + 3600000), status: 'scheduled', focus: pick(['Upper body', 'Legs and glutes', 'Core']), ...at(now) });
  });
  await insert(PtSession, pt);

  // ---- expenses and payroll ----
  const expenses = [];
  const spend = (e) => expenses.push({ _id: oid(), tenantId, method: 'bank', voided: false, createdBy: owner._id, ...e, ...at(e.date) });
  for (let m = 0; m < 6; m += 1) {
    const first = new Date(windowStart.getFullYear(), windowStart.getMonth() + m, 1);
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    const current = monthKey(first) === monthKey(today);
    branches.forEach((b) => {
      if (addDays(first, 1) <= today) spend({ branchId: b._id, category: 'rent', amount: b.rent, date: addDays(first, int(0, 2)), paidTo: `Landlord, ${b.name}` });
      const power = addDays(first, int(7, 11));
      if (power <= today) spend({ branchId: b._id, category: 'utilities', amount: rupees(b.power * between(0.85, 1.2), 100), date: power, paidTo: 'BESCOM electricity', method: 'upi' });
      const net = addDays(first, 14);
      if (net <= today) spend({ branchId: b._id, category: 'utilities', amount: 1799, date: net, paidTo: 'Airtel broadband', method: 'upi' });
      if (chance(0.55)) { const d = addDays(first, int(3, 25)); if (d <= today) spend({ branchId: b._id, category: 'maintenance', amount: rupees(between(2000, 14000), 100), date: d, paidTo: pick(['Treadmill service, FitCare', 'AC servicing, CoolTech', 'Plumbing repair', 'Rubber flooring repair', 'Cable machine service']), method: pick(['upi', 'cash']) }); }
    });
    const ads = addDays(first, int(4, 9));
    if (ads <= today) spend({ branchId: null, category: 'marketing', amount: rupees(between(6000, 11000), 100), date: ads, paidTo: 'Meta ads', method: 'upi' });
    if (chance(0.4)) { const d = addDays(first, int(10, 24)); if (d <= today) spend({ branchId: null, category: 'marketing', amount: rupees(between(4000, 8000), 100), date: d, paidTo: pick(['Local print and flyers', 'Influencer shoutout', 'Hoarding, Indiranagar']) }); }
    if (!current) {
      const month = monthKey(first);
      const date = last;
      staff.forEach((s) => {
        const bonus = s.role === 'trainer' && chance(0.5) ? rupees(between(1000, 3500), 100) : 0;
        spend({ branchId: branches[s.branch]._id, category: s.role === 'trainer' ? 'salary-trainer' : 'salary-manager', amount: s.salary + bonus, date, paidTo: s.name, staffId: s._id, payrollMonth: month, payrollKey: `${month}:staff:${s._id}`, base: s.salary, bonus, deduction: 0 });
      });
      payees.forEach((p) => spend({ branchId: branches[p.branch]._id, category: 'salary-other', amount: p.monthlySalary, date, paidTo: p.name, payeeId: p._id, payrollMonth: month, payrollKey: `${month}:payee:${p._id}`, base: p.monthlySalary, bonus: 0, deduction: 0 }));
    }
  }
  spend({ branchId: branches[0]._id, category: 'equipment', amount: 96000, date: addDays(windowStart, 38), paidTo: 'Technogym India, treadmill', method: 'bank' });
  spend({ branchId: branches[1]._id, category: 'equipment', amount: 38500, date: addDays(windowStart, 96), paidTo: 'Kettlebell and dumbbell set', method: 'upi' });
  const spendable = expenses.filter((e) => e.date <= today);
  await insert(Expense, spendable);

  // ---- equipment ----
  const gear = [['Treadmill', 'Cardio', 2], ['Cross trainer', 'Cardio', 1], ['Spin bike', 'Cardio', 2], ['Smith machine', 'Strength', 1], ['Cable crossover', 'Strength', 1], ['Leg press', 'Strength', 1], ['Dumbbell rack', 'Strength', 1], ['Flat bench', 'Strength', 2]];
  const equipment = [];
  branches.forEach((b, bi) => gear.forEach(([name, category, count]) => { for (let i = 1; i <= count; i += 1) {
    const purchase = addDays(today, -int(120, 1300));
    const last = addDays(today, -int(10, 160));
    const due = addDays(last, int(75, 100));
    equipment.push({ _id: oid(), tenantId, branchId: b._id, name: count > 1 ? `${name} ${i}` : name, category, purchaseDate: purchase, warrantyExpiry: addDays(purchase, 730), status: 'operational', lastServicedAt: last, nextServiceDue: due, ...at(purchase) });
  } }));
  const spin = equipment.find((e) => e.name === 'Spin bike 2' && String(e.branchId) === String(branches[2]._id));
  if (spin) { spin.status = 'under_maintenance'; spin.notes = 'Pedal crank replacement ordered.'; }
  const old = equipment.find((e) => e.name === 'Cross trainer' && String(e.branchId) === String(branches[1]._id));
  if (old) old.status = 'retired';
  await insert(Equipment, equipment);

  // ---- notices ----
  const notice = (n) => ({ _id: oid(), tenantId, branchIds: [], kind: 'news', audience: { type: 'everyone', days: 7, planId: null }, status: 'published', link: undefined, createdBy: owner._id, createdByName: owner.name, expiresAt: null, ...n });
  await insert(Announcement, [
    notice({ title: 'Diwali timings', body: 'All branches are open 6 am to 12 noon on Diwali day and closed on the day after. Happy Diwali from the FitzyClub team.', kind: 'notice', startsAt: addDays(today, -19), expiresAt: addDays(today, -11), ...at(addDays(today, -19)) }),
    notice({ title: 'Refer a friend, get a free month', body: 'Bring a friend who joins on any quarterly plan or above and your next month is on us. Show this at the front desk.', kind: 'offer', audience: { type: 'active', days: 7, planId: null }, startsAt: addDays(today, -12), expiresAt: addDays(today, 20), ...at(addDays(today, -12)) }),
    notice({ title: 'Renew early and save 10%', body: 'Your plan ends soon. Renew this week and get 10% off any plan.', kind: 'offer', audience: { type: 'expiring', days: 7, planId: null }, startsAt: addDays(today, -4), expiresAt: addDays(today, 10), ...at(addDays(today, -4)) }),
    notice({ title: 'New Zumba batch at Koramangala', body: 'A Tuesday and Thursday 7 am Zumba batch with Sneha starts this week. Book in the app.', branchIds: [branches[1]._id], startsAt: addDays(today, -5), ...at(addDays(today, -5)) }),
    notice({ title: 'Free health check camp', body: 'A physiotherapist will be at Indiranagar for free posture and fitness checks. Slots are limited.', branchIds: [branches[0]._id], kind: 'news', startsAt: addDays(today, 4), ...at(now) }),
  ]);

  // ---- ratings ----
  const ratings = [];
  members.filter((m) => !m._skip && chance(0.3)).forEach((m) => {
    ratings.push({ _id: oid(), tenantId, branchId: branches[m._bi]._id, memberId: m._id, targetType: 'gym', trainerId: null, stars: weighted([[5, 52], [4, 32], [3, 10], [2, 4], [1, 2]]), comment: chance(0.5) ? pick(['Clean and well run.', 'Great trainers and good equipment.', 'Gets crowded in the evening.', 'Love the morning classes.', 'The app makes renewals easy.']) : '', ...at(addDays(today, -int(1, 120))) });
    if (m.assignedTrainerId && chance(0.6)) ratings.push({ _id: oid(), tenantId, branchId: branches[m._bi]._id, memberId: m._id, targetType: 'trainer', trainerId: m.assignedTrainerId, stars: weighted([[5, 60], [4, 30], [3, 8], [2, 2]]), comment: chance(0.4) ? pick(['Very patient and knowledgeable.', 'Pushes me just enough.', 'Fixed my squat form.', 'Always on time.']) : '', ...at(addDays(today, -int(1, 90))) });
  });
  await insert(Rating, ratings);

  // ---- a summary you can check against what the app shows ----
  const paid = payments.filter((p) => p.status === 'paid');
  const byMonth = {};
  paid.forEach((p) => { byMonth[monthKey(p.paidAt)] = (byMonth[monthKey(p.paidAt)] || 0) + p.amount; });
  const active = memberDocs.filter((m) => m.membershipStatus === 'active').length;
  const sample = memberDocs.find((m) => m.membershipStatus === 'active');
  console.log(`\nSeeded "FitzyClub" in ${dbName}:`);
  console.log(`  ${branches.length} branches, ${staff.length + 1} staff, ${payees.length} other staff, ${plans.length} plans`);
  console.log(`  ${memberDocs.length} members (${active} active), ${payments.length} payments, ${attendance.length} check-ins`);
  console.log(`  ${sessions.length} classes, ${bookings.length} bookings, ${pt.length} personal training sessions`);
  console.log(`  ${spendable.length} expenses, ${equipment.length} equipment items, 5 notices, ${ratings.length} ratings`);
  console.log('  Collected by month:', Object.entries(byMonth).sort().map(([k, v]) => `${k} Rs ${v.toLocaleString('en-IN')}`).join(' | '));
  console.log('\nSign in:');
  console.log(`  Owner       owner@fitzyclub-demo.example.com`);
  console.log(`  Manager     ${emailOf(STAFF[0].name)}`);
  console.log(`  Trainer     ${emailOf(STAFF[3].name)}`);
  console.log(`  Member app  ${sample.memberCode}`);
  console.log(`  Password    ${DEMO_PASSWORD}   (the same for everyone)\n`);
  await mongoose.disconnect();
})().catch(async (err) => { console.error(err); try { await mongoose.disconnect(); } catch { /* already closed */ } process.exit(1); });
