const { FEATURE_REGISTRY } = require('../config/featureRegistry');

// Merges the registry's defaults with a tenant's overrides into a plain
// {key: boolean} object. This is the one place the merge happens — both the request
// middleware (backend/middleware/features.js) and the auth responses
// (backend/controllers/authController.js) call this, so there is never a second
// definition of "what's actually on" to drift out of sync.
//
// tenant.features is a Mongoose Map (possibly undefined if the tenant doc wasn't
// selected with it, or on a plain object in tests) — support both `.get()` and plain
// property access so callers don't need to know which shape they have.
const resolveFeatures = (tenant) => {
  const overrides = tenant?.features;
  const getOverride = (key) => {
    if (!overrides) return undefined;
    return typeof overrides.get === 'function' ? overrides.get(key) : overrides[key];
  };

  const resolved = {};
  for (const [key, def] of Object.entries(FEATURE_REGISTRY)) {
    const override = getOverride(key);
    resolved[key] = override === undefined ? def.default : override;
  }
  return resolved;
};

module.exports = { resolveFeatures };
