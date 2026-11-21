#!/usr/bin/env node
/**
 * Runs the real server against the DEMO database (see seedDemoGym.js) so you can click through the seeded FitzyClub gym without
 * going near your live data. Serves the built website too, so build it first: npm run build --prefix frontend.
 *
 *   node backend/scripts/startDemoServer.js          then open http://localhost:5100
 *
 * Refuses any database whose name does not end in "-demo". Change the port with DEMO_PORT.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const uri = process.env.MONGODB_URI_DEMO || String(process.env.MONGODB_URI || '').replace(/\/([^/?]+)(\?|$)/, '/$1-demo$2');
if (!/\/[^/?]*-demo(\?|$)/.test(uri)) {
  console.error('Refusing to start: the database name must end in "-demo". Set MONGODB_URI_DEMO, or MONGODB_URI so the "-demo" copy can be derived.');
  process.exit(1);
}
process.env.MONGODB_URI = uri;
process.env.PORT = process.env.DEMO_PORT || '5100';
process.env.NODE_ENV = 'development';
process.env.ALERTS = 'off';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'demo-only-secret-demo-only-secret-demo-only';
console.log(`Demo server: http://localhost:${process.env.PORT}  (database ends in -demo)`);
require('../server.js');
