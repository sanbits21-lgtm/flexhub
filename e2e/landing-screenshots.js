// Regenerates the product screenshots on the landing page (backend/public/landing/img) from a throwaway demo gym with fictional people.
// Run from this folder with the website built:  node landing-screenshots.js
// SAFETY: uses the same "-test" database guard as start-server.js. Nothing here touches real data.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const PORT = process.env.E2E_PORT || '5051';
const BASE = `http://localhost:${PORT}`;
const OUT = path.join(__dirname, '../backend/public/landing/img');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const NAMES = ['Aarav Mehta', 'Diya Nair', 'Rohan Iyer', 'Ananya Reddy', 'Kabir Shah', 'Meera Pillai', 'Vihaan Rao', 'Isha Kapoor', 'Arjun Das', 'Saanvi Menon', 'Rahul Verma', 'Priya Joshi', 'Karthik Gowda', 'Neha Singh'];

const api = async (token, method, url, body) => {
  const res = await fetch(`${BASE}${url}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status} ${JSON.stringify(json)}`);
  return json;
};

const signIn = async (page, email, password) => {
  await page.goto(`${BASE}/login`);
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('Your password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = spawn('node', ['start-server.js'], { cwd: __dirname, env: { ...process.env, E2E_GYM_NAME: 'Iron House Fitness', E2E_OWNER_NAME: 'Ravi Kumar', E2E_MEMBER_APP_URL: 'https://ironhouse.fitzyclub.in/member' }, stdio: 'inherit' });
  try {
    for (let i = 0; i < 90; i += 1) { try { if ((await fetch(`${BASE}/readyz`)).ok) break; } catch { /* not up yet */ } await sleep(1000); }
    const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '.seed.json'), 'utf8'));

    // Fictional demo data through the real API, so the screens show a gym in use.
    const { token } = await api(null, 'POST', '/api/auth/login', { email: seed.alpha.adminEmail, password: seed.password });
    const branches = await api(token, 'GET', '/api/branches');
    const branchId = (branches.items || branches)[0]._id;
    const plans = await api(token, 'GET', '/api/membership-plans');
    const monthly = (plans.items || plans)[0];
    const quarterly = await api(token, 'POST', '/api/membership-plans', { name: 'Quarterly', durationUnit: 'quarterly', price: 2700 });
    const yearly = await api(token, 'POST', '/api/membership-plans', { name: 'Annual', durationUnit: 'yearly', price: 9000 });
    const choices = [monthly, quarterly, yearly];
    let memberLogin = null;
    for (let i = 0; i < NAMES.length; i += 1) {
      const plan = choices[i % 3];
      const m = await api(token, 'POST', '/api/members', { name: NAMES[i], phone: `98${String(76500100 + i)}`, branchId, membershipPlanId: plan._id });
      await api(token, 'POST', '/api/payments', { memberId: m._id, membershipPlanId: plan._id, amount: plan.price, method: i % 4 === 0 ? 'upi' : 'cash', status: 'paid' });
      if (i === 0) memberLogin = m.appAccess;
    }
    const spend = (category, amount, paidTo) => api(token, 'POST', '/api/expenses', { category, amount, date: new Date().toISOString().slice(0, 10), paidTo, method: 'bank' });
    await spend('rent', 28000, 'Landlord');
    await spend('utilities', 6400, 'Electricity board');
    await spend('maintenance', 3200, 'Treadmill service');

    const browser = await chromium.launch();

    // 1. Owner dashboard, desktop.
    const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
    const dp = await desk.newPage();
    await signIn(dp, seed.alpha.adminEmail, seed.password);
    await dp.goto(`${BASE}/dashboard`);
    await dp.waitForLoadState('networkidle');
    await sleep(1500);
    await dp.screenshot({ path: path.join(OUT, 'dashboard.jpg'), type: 'jpeg', quality: 82 });

    // 2. The welcome card a new member receives: the owner adds a member and the card appears.
    const card = await browser.newContext({ viewport: { width: 760, height: 1000 }, colorScheme: 'dark' });
    const cp = await card.newPage();
    await signIn(cp, seed.alpha.adminEmail, seed.password);
    await cp.goto(`${BASE}/members`);
    await cp.locator('button', { hasText: /^\+ Add/ }).first().click();
    const form = cp.locator('form:has(input[type=tel])');
    await form.locator('input').nth(0).fill('Sneha Kulkarni');
    await form.locator('input[type=tel]').fill('9845012345');
    // The owner's form has a branch picker as well as the plan picker: fill each by what it offers.
    const selects = form.locator('select');
    for (let i = 0; i < await selects.count(); i += 1) {
      const options = await selects.nth(i).locator('option').allTextContents();
      const quarterly = options.findIndex((t) => /quarterly/i.test(t));
      if (quarterly > -1) await selects.nth(i).selectOption({ index: quarterly });
      else if (options.some((t) => /iron|main|alpha/i.test(t))) await selects.nth(i).selectOption({ index: Math.min(1, options.length - 1) });
    }
    await form.getByRole('button', { name: 'Save Member' }).click();
    await cp.getByRole('button', { name: 'Done' }).click();
    await cp.getByText('Welcome,').waitFor();
    await sleep(900);
    await cp.locator('div.max-h-\\[90vh\\]').screenshot({ path: path.join(OUT, 'welcome-card.jpg'), type: 'jpeg', quality: 85 });

    // 3. The member app on a phone.
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
    const pp = await phone.newPage();
    await pp.goto(`${BASE}/member/login`);
    await pp.getByRole('textbox').first().fill(memberLogin.memberCode);
    await pp.locator('input[type=password]').fill(memberLogin.password);
    await pp.getByRole('button', { name: /sign in|log in/i }).click();
    await pp.waitForURL((u) => !u.pathname.endsWith('/login'));
    await pp.waitForLoadState('networkidle');
    await sleep(1500);
    await pp.screenshot({ path: path.join(OUT, 'member-app.jpg'), type: 'jpeg', quality: 80 });

    await browser.close();
    for (const f of ['dashboard.jpg', 'welcome-card.jpg', 'member-app.jpg']) console.log(f, Math.round(fs.statSync(path.join(OUT, f)).size / 1024), 'KB');
  } finally {
    server.kill();
  }
})().catch((e) => { console.error(e); process.exit(1); });
