const Tenant = require('../models/Tenant');
const Branch = require('../models/Branch');

// Where a branch's UPI payments go. A gym has one default account (Tenant.upiId); a branch may have
// its own (Branch.upiId), for example when each location banks separately. A branch with its own
// UPI ID uses that ID AND that branch's own link, never the gym's link: the link points at the gym's
// account, and mixing the two would send a branch's money to the wrong place.
const resolvePaymentAccount = (tenant, branch) => {
  if (branch && branch.upiId) return { upiId: branch.upiId, upiPaymentLink: branch.upiPaymentLink || '', source: 'branch' };
  return { upiId: (tenant && tenant.upiId) || '', upiPaymentLink: (tenant && tenant.upiPaymentLink) || '', source: 'gym' };
};

/** The account a payment collected at this branch goes into, looked up now. */
const accountFor = async (tenantId, branchId) => {
  const [tenant, branch] = await Promise.all([
    Tenant.findById(tenantId).select('upiId upiPaymentLink').lean(),
    branchId ? Branch.findOne({ _id: branchId, tenantId }).select('upiId upiPaymentLink').lean() : null,
  ]);
  return resolvePaymentAccount(tenant, branch);
};

module.exports = { resolvePaymentAccount, accountFor };
