// What happens at "/" and at the app's start address for people who are already signed in, in the situations that matter.
// Runs against the demo server (see docs/DEMO.md). One login only, reused for every case.
const { chromium } = require('@playwright/test');
const BASE = process.env.DEMO_URL || 'http://localhost:5100';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const where = async (page) => {
  await sleep(1500);
  const url = new URL(page.url());
  const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  return {
    path: url.pathname + url.search,
    shows: /Run your whole gym from one app/.test(text) ? 'LANDING PAGE' : /Log in/.test(text) && /Email/.test(text) ? 'LOGIN PAGE' : /Welcome back|Dashboard/.test(text) ? 'DASHBOARD (signed in)' : text.slice(0, 60),
  };
};

(async () => {
  const browser = await chromium.launch();
  const base = await browser.newContext();
  const page = await base.newPage();
  await page.goto(`${BASE}/login`);
  await page.getByPlaceholder('you@example.com').fill('owner@fitzyclub-demo.example.com');
  await page.getByPlaceholder('Your password').fill('FitzyDemo#2026');
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
  await page.waitForLoadState('networkidle');
  await sleep(1500);
  const sw = await page.evaluate(async () => { const r = await navigator.serviceWorker?.getRegistration(); return !!(r && (r.active || r.installing || r.waiting)); });
  console.log('1. signed in; offline cache (service worker) installed:', sw);

  await page.goto(`${BASE}/`);
  console.log('2. signed in, open "/" (flag set, offline cache active):', JSON.stringify(await where(page)));

  const state = await base.storageState();
  const cookiesOnly = { cookies: state.cookies, origins: [] }; // the remembered-login flag (localStorage) is gone, the real session cookie stays

  let ctx = await browser.newContext({ storageState: cookiesOnly, serviceWorkers: 'block' });
  let p = await ctx.newPage();
  await p.goto(`${BASE}/`);
  console.log('3. cookie kept, flag cleared, no offline cache yet, open "/":', JSON.stringify(await where(p)));
  const loginLink = p.getByRole('link', { name: 'Log in' }).first();
  await loginLink.click();
  console.log('   ...then press "Log in":', JSON.stringify(await where(p)));
  await ctx.close();

  ctx = await browser.newContext({ storageState: cookiesOnly, serviceWorkers: 'block' });
  p = await ctx.newPage();
  await p.goto(`${BASE}/dashboard`);
  console.log('4. installed-app start (/dashboard), cookie only:', JSON.stringify(await where(p)));
  const flagAfter = await p.evaluate(() => localStorage.getItem('fitzy_signed_in'));
  console.log('   remembered-login flag set again after that:', flagAfter);
  await ctx.close();

  // a signed-OUT visitor whose browser already has the offline cache (someone who used the app or the sign-up page before)
  ctx = await browser.newContext();
  p = await ctx.newPage();
  await p.goto(`${BASE}/login`);
  await p.waitForLoadState('networkidle');
  await sleep(2500);
  const sw2 = await p.evaluate(async () => { const r = await navigator.serviceWorker?.getRegistration(); return !!(r && r.active); });
  await p.goto(`${BASE}/`);
  console.log('5. signed OUT, offline cache installed =', sw2, ', open "/":', JSON.stringify(await where(p)));
  await ctx.close();

  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
