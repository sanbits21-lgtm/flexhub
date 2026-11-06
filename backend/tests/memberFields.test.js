const { app, request, connect, disconnect, seedTenant, createMember, auth } = require('./helpers');
const Member = require('../models/Member');

let A; let B;
const plansAndBranch = (t) => ({ branchId: t.branch._id.toString(), planId: t.plan._id.toString() });
const addField = (token, body) => request(app).post('/api/tenant-settings/member-fields').set(auth(token)).send(body);
const bulk = (t, body) => request(app).post('/api/members/bulk').set(auth(t.managerToken)).send({ branchId: t.branch._id.toString(), ...body });

beforeAll(async () => {
  await connect();
  A = await seedTenant('fields-a');
  B = await seedTenant('fields-b');
}, 120000);
afterAll(disconnect);

describe('custom member fields: definitions', () => {
  it('the owner can add fields; a key is made from the name and never reused', async () => {
    const r1 = await addField(A.adminToken, { label: 'Blood group' });
    expect(r1.status).toBe(201);
    expect(r1.body).toEqual({ key: 'blood_group', label: 'Blood group', type: 'text' });
    expect((await addField(A.adminToken, { label: 'Age', type: 'number' })).body).toMatchObject({ key: 'age', type: 'number' });
    expect((await addField(A.adminToken, { label: 'Joined on', type: 'date' })).body.type).toBe('date');
    // different wording, same slug: still gets its own key
    expect((await addField(A.adminToken, { label: 'blood-group' })).body.key).toBe('blood_group_2');
  });

  it('refuses a repeated name (any case), bad types and empty names', async () => {
    expect((await addField(A.adminToken, { label: 'BLOOD GROUP' })).status).toBe(409);
    expect((await addField(A.adminToken, { label: 'X', type: 'boolean' })).status).toBe(400);
    expect((await addField(A.adminToken, { label: '   ' })).status).toBe(400);
    expect((await addField(A.adminToken, { label: '!!!' })).status).toBe(400);
    expect((await addField(A.adminToken, { label: 'y'.repeat(41) })).status).toBe(400);
  });

  it('staff can read the fields but only the owner can add them; gyms are separate', async () => {
    const asManager = await request(app).get('/api/tenant-settings/member-fields').set(auth(A.managerToken));
    expect(asManager.status).toBe(200);
    expect(asManager.body.fields.map((f) => f.key)).toEqual(expect.arrayContaining(['blood_group', 'age']));
    expect((await addField(A.managerToken, { label: 'Locker' })).status).toBe(403);
    const other = await request(app).get('/api/tenant-settings/member-fields').set(auth(B.adminToken));
    expect(other.body.fields).toEqual([]);
  });

  it('caps the number of fields', async () => {
    const t = await seedTenant('fields-cap');
    for (let i = 0; i < 20; i += 1) expect((await addField(t.adminToken, { label: `Field ${i}` })).status).toBe(201);
    const over = await addField(t.adminToken, { label: 'One too many' });
    expect(over.status).toBe(400);
    expect(over.body.message).toMatch(/at most 20/);
  });
});

describe('custom member fields: values', () => {
  const create = (t, extra) => request(app).post('/api/members').set(auth(t.managerToken))
    .send({ branchId: t.branch._id.toString(), name: 'Field Person', phone: '9300000001', ...extra });

  it('are saved on create, typed, and returned in the list', async () => {
    // a key the gym never defined is refused rather than silently dropped
    expect((await create(A, { customFields: { blood_group: 'O+', nope: 'x' } })).status).toBe(400);
    const real = await create(A, { phone: '9300000003', customFields: { blood_group: ' O+ ', age: '31' } });
    expect(real.status).toBe(201);
    expect(real.body.customFields).toEqual({ blood_group: 'O+', age: 31 });
    const list = await request(app).get('/api/members').set(auth(A.adminToken));
    expect(list.body.members.find((m) => m.phone === '9300000003').customFields).toEqual({ blood_group: 'O+', age: 31 });
  });

  it('are validated by type', async () => {
    expect((await create(A, { phone: '9300000004', customFields: { age: 'abc' } })).status).toBe(400);
    expect((await create(A, { phone: '9300000005', customFields: { age: '1,250' } })).body.customFields.age).toBe(1250);
    expect((await create(A, { phone: '9300000006', customFields: { blood_group: 'x'.repeat(201) } })).status).toBe(400);
    expect((await create(A, { phone: '9300000007', customFields: [] })).status).toBe(400);
  });

  it("cannot use another gym's field", async () => {
    const res = await request(app).post('/api/members').set(auth(B.managerToken))
      .send({ branchId: B.branch._id.toString(), name: 'Cross', phone: '9300000008', customFields: { blood_group: 'A+' } });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Unknown field/);
  });

  it('are edited one at a time and can be cleared', async () => {
    const m = (await create(A, { phone: '9300000009', customFields: { blood_group: 'B+', age: 40 } })).body;
    const put = (customFields) => request(app).put(`/api/members/${m._id}`).set(auth(A.managerToken)).send({ customFields });
    expect((await put({ blood_group: 'AB+' })).body.customFields).toEqual({ blood_group: 'AB+', age: 40 });
    expect((await put({ age: '' })).body.customFields).toEqual({ blood_group: 'AB+' });
    expect((await put({ nope: 'x' })).status).toBe(400);
    // an ordinary edit leaves them alone
    const rename = await request(app).put(`/api/members/${m._id}`).set(auth(A.managerToken)).send({ name: 'Renamed' });
    expect(rename.body.customFields).toEqual({ blood_group: 'AB+' });
  });

  it('are never sent to the member app', async () => {
    const m = (await create(A, { phone: '9300000010', customFields: { blood_group: 'O-' } })).body;
    const access = await request(app).post(`/api/members/${m._id}/app-access`).set(auth(A.managerToken));
    const login = await request(app).post('/api/member-auth/login').send({ identifier: access.body.memberCode, password: access.body.password });
    const me = await request(app).get('/api/members/me').set(auth(login.body.token));
    expect(me.status).toBe(200);
    expect(me.body.customFields).toBeUndefined();
    const profile = await request(app).get('/api/member-app/profile').set(auth(login.body.token));
    expect(JSON.stringify(profile.body)).not.toMatch(/blood_group|O-/);
  });
});

describe('bulk import', () => {
  it('saves custom fields, emergency contacts and reports a bad value per row', async () => {
    const res = await bulk(A, {
      members: [
        { name: 'Bulk One', phone: '9400000001', customFields: { blood_group: 'A+', age: '22' }, emergencyContact: { name: 'Mum', phone: '9400000099' } },
        { name: 'Bulk Two', phone: '9400000002', customFields: { age: 'not a number' } },
        { name: 'Bulk Three', phone: '9400000003', customFields: { unknown_key: 'x' } },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.succeeded).toBe(1);
    expect(res.body.results[1].error).toMatch(/Age must be a number/);
    expect(res.body.results[2].error).toMatch(/Unknown field/);
    const saved = await Member.findOne({ phone: '9400000001' }).lean();
    expect(saved.customFields).toEqual({ blood_group: 'A+', age: 22 });
    expect(saved.emergencyContact).toMatchObject({ name: 'Mum', phone: '9400000099' });
  });

  it('skips duplicate phones only when asked to, comparing the last 10 digits', async () => {
    await createMember(A.managerToken, { ...plansAndBranch(A), name: 'Already Here', phone: '9500000001' });
    const members = [
      { name: 'Same As Existing', phone: '+91 95000 00001' },
      { name: 'Fresh', phone: '9500000002' },
      { name: 'Repeat In File', phone: '9500000002' },
    ];
    const strict = await bulk(A, { members, skipDuplicatePhones: true });
    expect(strict.body.succeeded).toBe(1);
    expect(strict.body.results[0].error).toMatch(/already belongs to Already Here/);
    expect(strict.body.results[2].error).toMatch(/Same phone as row 2/);

    // Without the flag nothing is skipped, as before.
    const loose = await bulk(A, { members: [{ name: 'Same Again', phone: '9500000001' }] });
    expect(loose.body.succeeded).toBe(1);
  });

  it('does not treat a deactivated member as a duplicate', async () => {
    const m = await createMember(A.managerToken, { ...plansAndBranch(A), name: 'Left The Gym', phone: '9500000050' });
    await request(app).delete(`/api/members/${m._id}`).set(auth(A.managerToken));
    const res = await bulk(A, { members: [{ name: 'Back Again', phone: '9500000050' }], skipDuplicatePhones: true });
    expect(res.body.succeeded).toBe(1);
  });

  it('tells the import screen which rows already exist', async () => {
    const res = await request(app).post('/api/members/bulk/check').set(auth(A.managerToken))
      .send({ phones: ['9500000001', '9999999999', '', '095000 00001'] });
    expect(res.status).toBe(200);
    expect(res.body.existing).toEqual([{ row: 0, memberName: 'Already Here' }, { row: 3, memberName: 'Already Here' }]);
    expect((await request(app).post('/api/members/bulk/check').set(auth(A.managerToken)).send({ phones: [] })).status).toBe(400);
    // another gym's members are invisible
    const other = await request(app).post('/api/members/bulk/check').set(auth(B.managerToken)).send({ phones: ['9500000001'] });
    expect(other.body.existing).toEqual([]);
  });
});
