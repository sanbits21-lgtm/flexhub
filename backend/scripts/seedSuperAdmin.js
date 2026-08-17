require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const email = (process.env.SEED_EMAIL || 'super@example.com').toLowerCase();
  const existing = await User.findOne({ email });
  if (existing) {
    console.log(`Super admin already exists: ${email}`);
    process.exit(0);
  }

  await User.create({
    name: process.env.SEED_NAME || 'Super Admin',
    email,
    phone: process.env.SEED_PHONE || '0000000000',
    password: process.env.SEED_PASSWORD || 'ChangeMe@123',
    role: 'super-admin',
  });

  console.log(`Super admin created: ${email}`);
  process.exit(0);
};

run().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
