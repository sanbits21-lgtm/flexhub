const jwt = require('jsonwebtoken');

const generateToken = (id, actorType) =>
  jwt.sign({ id, actorType }, process.env.JWT_SECRET, { expiresIn: '30d' });

module.exports = generateToken;
