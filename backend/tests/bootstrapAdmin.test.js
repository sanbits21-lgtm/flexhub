const { connect, disconnect } = require('./helpers');
const User = require('../models/User');
const { bootstrapSuperAdmin } = require('../utils/bootstrapAdmin');

const quiet = { log: () => {}, warn: jest.fn() };
const env = (over = {}) => ({ SUPER_ADMIN_EMAIL: 'Boot@Example.com', SUPER_ADMIN_PASSWORD: 'a-long-password-1', ...over });

beforeAll(connect, 120000);
afterAll(disconnect);
beforeEach(async () => { await User.deleteMany({ email: 'boot@example.com' }); quiet.warn.mockClear(); });

describe('bootstrapSuperAdmin', () => {
  it('creates a super-admin that can verify its password', async () => {
    expect(await bootstrapSuperAdmin(env(), quiet)).toBe('boot@example.com');
    const u = await User.findOne({ email: 'boot@example.com' });
    expect(u.role).toBe('super-admin');
    expect(await u.matchPassword('a-long-password-1')).toBe(true);
  });

  it('never touches an account that already exists', async () => {
    await bootstrapSuperAdmin(env(), quiet);
    expect(await bootstrapSuperAdmin(env({ SUPER_ADMIN_PASSWORD: 'another-long-password' }), quiet)).toBeNull();
    const u = await User.findOne({ email: 'boot@example.com' });
    expect(await u.matchPassword('a-long-password-1')).toBe(true);
  });

  it('does nothing when unset, and skips a half-set or short password', async () => {
    expect(await bootstrapSuperAdmin({}, quiet)).toBeNull();
    expect(await bootstrapSuperAdmin(env({ SUPER_ADMIN_PASSWORD: '' }), quiet)).toBeNull();
    expect(await bootstrapSuperAdmin(env({ SUPER_ADMIN_PASSWORD: 'short' }), quiet)).toBeNull();
    expect(quiet.warn).toHaveBeenCalledTimes(2);
    expect(await User.exists({ email: 'boot@example.com' })).toBeNull();
  });
});
