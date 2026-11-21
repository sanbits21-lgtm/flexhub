// Photographs the staff website in LIGHT mode against the demo gym (see docs/DEMO.md), to review the theme.
// Usage: node theme-shots.js <output folder> [prefix] [dark]
const path = require('path');
const { chromium } = require('@playwright/test');
const BASE = process.env.DEMO_URL || 'http://localhost:5100';
const out = process.argv[2] || __dirname;
const prefix = process.argv[3] || 'light';
const mode = process.argv[4] === 'dark' ? 'dark' : 'light';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: mode });
  await ctx.addInitScript((m) => { try { localStorage.setItem('theme', m); } catch (e) { /* ignore */ } }, mode);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await sleep(800);
  await page.screenshot({ path: path.join(out, `${prefix}-login.png`) });
  await page.getByPlaceholder('you@example.com').fill('owner@fitzyclub-demo.example.com');
  await page.getByPlaceholder('Your password').fill('FitzyDemo#2026');
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
  const routes = [['dashboard', '/dashboard'], ['members', '/members'], ['payments', '/payments'], ['expenses', '/expenses'], ['reports', '/reports'], ['plans', '/membership-plans'], ['branches', '/branches'], ['equipment', '/equipment'], ['announcements', '/announcements']];
  for (const [name, route] of routes) {
    await page.goto(`${BASE}${route}`);
    await page.waitForLoadState('networkidle');
    await sleep(1200);
    await page.screenshot({ path: path.join(out, `${prefix}-${name}.png`) });
  }
  await page.goto(`${BASE}/members`);
  await page.waitForLoadState('networkidle');
  await page.locator('button', { hasText: /^\+ Add/ }).first().click();
  await sleep(700);
  await page.screenshot({ path: path.join(out, `${prefix}-modal.png`) });
  await browser.close();
  console.log('done');
})().catch((e) => { console.error(e); process.exit(1); });
