// Photographs the member app on a phone, in light or dark, against the demo gym. Usage: node member-theme-shots.js <folder> <prefix> [dark]
const path = require('path');
const { chromium } = require('@playwright/test');
const BASE = process.env.DEMO_URL || 'http://localhost:5100';
const out = process.argv[2] || __dirname;
const prefix = process.argv[3] || 'member-light';
const mode = process.argv[4] === 'dark' ? 'dark' : 'light';
const code = process.env.DEMO_MEMBER || 'GYM-S62212';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, colorScheme: mode });
  await ctx.addInitScript((m) => { try { localStorage.setItem('theme', m); } catch (e) { /* ignore */ } }, mode);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/member/login`);
  await sleep(700);
  await page.screenshot({ path: path.join(out, `${prefix}-login.png`) });
  await page.getByRole('textbox').first().fill(code);
  await page.locator('input[type=password]').fill('FitzyDemo#2026');
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL((u) => !u.pathname.endsWith('/login'));
  await page.waitForLoadState('networkidle');
  await sleep(1200);
  await page.screenshot({ path: path.join(out, `${prefix}-home.png`) });
  await browser.close();
  console.log('done');
})().catch((e) => { console.error(e); process.exit(1); });
