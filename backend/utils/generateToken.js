const jwt = require('jsonwebtoken');

// The short-lived ACCESS token every API call carries. It is useless without the refresh token
// that renews it (see utils/sessions.js), so a stolen one stops working within minutes.
const ACCESS_MINUTES = Number(process.env.ACCESS_TOKEN_MINUTES) > 0 ? Number(process.env.ACCESS_TOKEN_MINUTES) : 15;

const generateToken = (id, actorType, sid) =>
  jwt.sign({ id, actorType, ...(sid ? { sid: String(sid) } : {}) }, process.env.JWT_SECRET, { expiresIn: `${ACCESS_MINUTES}m` });

module.exports = generateToken;
module.exports.ACCESS_MINUTES = ACCESS_MINUTES;
