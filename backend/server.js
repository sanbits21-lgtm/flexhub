require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const connectDB = require('./config/db');
const app = require('./app');

// The express app itself lives in app.js so the test suite can mount it with supertest
// without opening a port or connecting to the production database.
const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}).catch((err) => {
  console.error('Failed to connect to MongoDB', err);
  process.exit(1);
});
