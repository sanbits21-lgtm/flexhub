const Member = require('../models/Member');
const generateToken = require('../utils/generateToken');

exports.login = async (req, res) => {
  const { email, password } = req.body;
  const member = await Member.findOne({ email: email?.toLowerCase() });
  if (!member || !member.isActive || !(await member.matchPassword(password))) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  res.json({
    token: generateToken(member._id, 'member'),
    member: {
      _id: member._id,
      name: member.name,
      email: member.email,
      memberCode: member.memberCode,
      tenantId: member.tenantId,
      branchId: member.branchId,
      membershipStatus: member.membershipStatus,
    },
  });
};

exports.getMe = async (req, res) => {
  res.json({ member: req.member });
};
