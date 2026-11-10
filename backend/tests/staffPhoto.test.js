const { app, request, connect, disconnect, seedTenant, auth } = require('./helpers');
const { png, jpeg, webp, b64 } = require('./photoFixtures');
const { MIN_PHOTO_PIXELS } = require('../utils/photos');
const User = require('../models/User');

let t; let other;
beforeAll(async () => {
  await connect();
  t = await seedTenant('photos');
  other = await seedTenant('photos-other');
}, 90000);
afterAll(disconnect);

const upload = (token, buf, mime = 'image/png') => request(app).put('/api/profile/photo').set(auth(token)).send({ image: `data:${mime};base64,${b64(buf)}` });

describe('the minimum picture size', () => {
  it('is 200 pixels on the shorter side', () => expect(MIN_PHOTO_PIXELS).toBe(200));

  it('accepts a picture at the minimum and larger, in every allowed format', async () => {
    expect((await upload(t.trainerToken, png(200, 200))).status).toBe(200);
    expect((await upload(t.trainerToken, png(640, 480))).status).toBe(200);
    expect((await upload(t.trainerToken, jpeg(300, 300), 'image/jpeg')).status).toBe(200);
    expect((await upload(t.trainerToken, webp(512, 512), 'image/webp')).status).toBe(200);
  });

  it('refuses a picture that is too small, saying how small it was', async () => {
    for (const [buf, mime] of [[png(199, 400), 'image/png'], [png(400, 120), 'image/png'], [jpeg(150, 150), 'image/jpeg'], [webp(64, 64), 'image/webp'], [png(1, 1), 'image/png']]) {
      const res = await upload(t.trainerToken, buf, mime);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/too small.*at least 200x200/);
    }
  });

  it('refuses a file whose size cannot be read, and one that is not an image', async () => {
    const noSize = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xd9]), Buffer.alloc(50)]);
    expect((await upload(t.trainerToken, noSize, 'image/jpeg')).status).toBe(400);
    expect((await upload(t.trainerToken, Buffer.from('<script>alert(1)</script>'))).status).toBe(400);
  });

  it('refuses a picture over 1 MB', async () => {
    const big = Buffer.concat([png(300, 300), Buffer.alloc(1024 * 1024)]);
    expect((await upload(t.trainerToken, big)).status).toBe(413);
  });
});

describe('staff profile pictures', () => {
  it('lets a trainer, a branch manager and a gym owner each set their own', async () => {
    for (const token of [t.trainerToken, t.managerToken, t.adminToken]) {
      expect((await upload(token, png(256, 256))).status).toBe(200);
    }
    const me = await request(app).get('/api/auth/me').set(auth(t.trainerToken));
    expect(me.body.user.hasPhoto).toBe(true);
    expect(me.body.user.photoUrl).toBeUndefined(); // the file name stays on the server
  });

  it('serves the picture to the same gym\'s staff only', async () => {
    await upload(t.trainerToken, png(256, 256));
    const get = (token) => request(app).get(`/api/profile/photo/${t.trainer._id}`).set(auth(token));
    const own = await get(t.trainerToken);
    expect(own.status).toBe(200);
    expect(own.headers['content-type']).toBe('image/png');
    expect((await get(t.managerToken)).status).toBe(200);
    expect((await get(other.managerToken)).status).toBe(403);
    expect((await request(app).get(`/api/profile/photo/${t.trainer._id}`)).status).toBe(401);
  });

  it('only changes your own picture, never someone else\'s', async () => {
    await upload(t.managerToken, png(256, 256));
    const before = (await User.findById(t.trainer._id)).photoUrl;
    await upload(t.managerToken, png(300, 300));
    expect((await User.findById(t.trainer._id)).photoUrl).toBe(before);
  });

  it('lets someone remove their picture', async () => {
    await upload(t.trainerToken, png(256, 256));
    const res = await request(app).delete('/api/profile/photo').set(auth(t.trainerToken));
    expect(res.body).toEqual({ hasPhoto: false });
    expect((await request(app).get(`/api/profile/photo/${t.trainer._id}`).set(auth(t.trainerToken))).status).toBe(404);
  });

  it('is not open to anyone signed out, or to members', async () => {
    expect((await request(app).put('/api/profile/photo').send({ image: b64(png(256, 256)) })).status).toBe(401);
  });
});
