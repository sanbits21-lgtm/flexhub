const mongoose = require('mongoose');
const Branch = require('../models/Branch');

// Which branches a membership plan can be used at. `branchIds` empty means every branch (and any branch
// added later); otherwise only the listed ones. One place decides this so the member, renewal, payment and
// import checks cannot drift apart.
const sameId = (a, b) => String(a) === String(b);

const planAllowedAt = (plan, branchId) => {
  const ids = plan.branchIds || [];
  return !ids.length || ids.some((id) => sameId(id, branchId));
};

// A query fragment for "plans usable at this branch". Plans saved before the list existed have no field at all.
const usableAtFilter = (branchId) => ({ $or: [{ branchIds: { $exists: false } }, { branchIds: { $size: 0 } }, { branchIds: branchId }] });

/**
 * Reads the branches a request names for a plan. Accepts `branchIds` (a list), or the older single `branchId`
 * (null or empty = every branch). Returns { ids } (possibly empty), { ids: undefined } when the request says
 * nothing about branches, or { error } when a branch is not this gym's.
 */
const readPlanBranches = async (body, tenantId) => {
  let raw;
  if (body.branchIds !== undefined) raw = body.branchIds;
  else if (body.branchId !== undefined) raw = body.branchId ? [body.branchId] : [];
  else return { ids: undefined };
  if (!Array.isArray(raw)) return { error: 'branchIds must be a list of branch ids' };
  const ids = [...new Set(raw.map(String))];
  if (ids.some((id) => !mongoose.isValidObjectId(id))) return { error: 'Branch not found for this tenant' };
  if (ids.length) {
    const found = await Branch.countDocuments({ _id: { $in: ids }, tenantId });
    if (found !== ids.length) return { error: 'Branch not found for this tenant' };
  }
  return { ids };
};

module.exports = { planAllowedAt, usableAtFilter, readPlanBranches, sameId };
