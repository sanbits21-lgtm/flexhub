const mongoose = require('mongoose');

// A last line of defence for gym isolation, at the data layer.
//
// Controllers filter every query by the caller's gym, and validate the ids a request names. But a
// record that merely REFERENCES another one (a payment pointing at a plan, a class pointing at a
// trainer) is only as safe as the one controller that remembered to check, and the reference is then
// followed whenever the record is read: the plan's name is shown on the payment, the trainer's on the
// class. One forgotten check is a gym reading another gym's data.
//
// This plugin makes the rule structural: a record cannot be saved while any of the ids it points to
// belongs to a different gym. It runs on create and on every change to a reference, so it protects
// code written next year as well as code written today.
//
//   schema.plugin(tenantRefs, { branchId: 'Branch', memberId: 'Member', membershipPlanId: 'MembershipPlan' });
//
// Every referenced model must carry its own `tenantId`. Updates that bypass documents
// (findOneAndUpdate, updateOne) are not covered here: those are validated in the controllers and
// attacked, route by route, by tests/isolation.test.js.

module.exports = function tenantRefs(schema, refs) {
  schema.pre('validate', async function enforceSameGym() {
    if (!this.tenantId) return; // platform-level records (platform admins) belong to no gym

    // A path holds one id, or a list of them (a plan's branches): every id in the list has to be this gym's.
    const present = (value) => (Array.isArray(value) ? value.length > 0 : !!value);
    const checks = Object.entries(refs)
      .filter(([path]) => present(this.get(path)) && (this.isNew || this.isModified(path)))
      .map(async ([path, modelName]) => {
        const value = this.get(path);
        if (Array.isArray(value)) {
          const wanted = [...new Set(value.map(String))];
          const found = await mongoose.model(modelName).countDocuments({ _id: { $in: wanted }, tenantId: this.tenantId });
          if (found !== wanted.length) this.invalidate(path, 'does not belong to this gym', value);
          return;
        }
        const ok = await mongoose.model(modelName).exists({ _id: value, tenantId: this.tenantId });
        if (!ok) this.invalidate(path, 'does not belong to this gym', value);
      });
    await Promise.all(checks);
  });
};
