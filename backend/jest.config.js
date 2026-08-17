module.exports = {
  testEnvironment: 'node',
  // Every suite shares one Atlas test database, so they run one at a time rather than
  // racing each other's fixtures.
  maxWorkers: 1,
  // Atlas round-trips are slower than a local mongod; the default 5s is too tight for
  // fixture setup that creates a tenant, branch, three users and a plan.
  testTimeout: 30000,
  setupFiles: ['<rootDir>/tests/setEnv.js'],
  testMatch: ['<rootDir>/tests/**/*.test.js'],
};
