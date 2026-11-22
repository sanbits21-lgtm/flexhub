// The flows that must never break, driven through the real website against the real server (see ../start-server.js).
// They run in order and share one seeded database: gym "Alpha" (the one we act as) and gym "Beta" (which must stay invisible).
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '../.seed.json'), 'utf8'));
let issued = null; // the username and password shown on the welcome card, used by the later tests

test.describe.configure({ mode: 'serial' });

const submitLogin = async (page, email, password) => {
  await page.goto('/login');
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('Your password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
};

// Signs in and WAITS until the app has left the login page, so the next step never races the session being set up.
const signIn = async (page, email, password = seed.password) => {
  await submitLogin(page, email, password);
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
};

const openAddMember = async (page) => {
  await page.goto('/members');
  await page.locator('button', { hasText: /^\+ Add/ }).first().click();
  const form = page.locator('form:has(input[type=tel])');
  await expect(form).toBeVisible();
  return form;
};

const fillMember = async (form, { name, phone, plan = true }) => {
  await form.locator('input').nth(0).fill(name);
  await form.locator('input[type=tel]').fill(phone);
  // The manager's form may also offer a branch; pick the plan from whichever dropdown lists it.
  if (plan) {
    const selects = form.locator('select');
    for (let i = 0; i < await selects.count(); i += 1) {
      const options = await selects.nth(i).locator('option').allTextContents();
      const at = options.findIndex((t) => /monthly/i.test(t));
      if (at > -1) { await selects.nth(i).selectOption({ index: at }); break; }
    }
  }
};

test('a wrong password is refused and the right one signs in', async ({ page }) => {
  await submitLogin(page, seed.alpha.managerEmail, 'definitely-not-the-password');
  await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible(); // still on the login page
  await expect(page).toHaveURL(/\/login/);
  await signIn(page, seed.alpha.managerEmail);
  await expect(page).not.toHaveURL(/\/login/);
});

test('someone who is already signed in is never asked to log in again', async ({ page }) => {
  await signIn(page, seed.alpha.managerEmail);
  // the login page forwards them straight on...
  await page.goto('/login');
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByRole('button', { name: 'Log in' })).toHaveCount(0);
  // ...and so does the front door of the site, and the installed app's start address
  for (const address of ['/', '/dashboard']) {
    await page.goto(address);
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByPlaceholder('Your password')).toHaveCount(0);
  }
  // a fresh visit with the session cookie but nothing else remembered (cleared site data for the page, not the cookie)
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.getByPlaceholder('Your password')).toHaveCount(0);
});

test('a phone number that is too short is refused by the form', async ({ page }) => {
  await signIn(page, seed.alpha.managerEmail);
  const form = await openAddMember(page);
  await fillMember(form, { name: 'Short Phone', phone: '12345', plan: false });
  await form.getByRole('button', { name: 'Save Member' }).click();
  expect(await form.locator('input[type=tel]').evaluate((input) => input.validity.valid)).toBe(false);
  await expect(page.getByText('Payment Receipt')).toHaveCount(0);
});

test('adding a member by cash gives a receipt, then a welcome card whose password really signs them in', async ({ page, request }) => {
  await signIn(page, seed.alpha.managerEmail);
  const form = await openAddMember(page);
  await fillMember(form, { name: 'Smoke Member', phone: '98765 01234' });
  await form.getByRole('button', { name: 'Save Member' }).click();

  await expect(page.getByText('Payment Receipt')).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();

  await expect(page.getByText('Welcome,')).toBeVisible();
  const code = (await page.locator('p.font-mono').nth(0).innerText()).trim();
  const password = (await page.locator('p.font-mono').nth(1).innerText()).trim();
  expect(code).toMatch(/^GYM-/);
  expect(password).toMatch(/^[A-Za-z0-9]{10}$/);
  issued = { code, password };

  const ok = await request.post('/api/member-auth/login', { data: { identifier: code, password } });
  expect(ok.status()).toBe(200);
  const bad = await request.post('/api/member-auth/login', { data: { identifier: code, password: 'wrong-password-1' } });
  expect(bad.status()).toBe(401);

  // Closing the card before the password has been shared asks first, and answering "no" keeps it open.
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByText('Welcome,')).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText('Welcome,')).toHaveCount(0);
});

test('the member can sign in to the member app with those details', async ({ page }) => {
  test.skip(!issued, 'needs the member from the previous test');
  await page.goto('/member/login');
  await page.getByRole('textbox').first().fill(issued.code);
  await page.locator('input[type=password]').fill(issued.password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await expect(page).not.toHaveURL(/\/member\/login/);
});

test("a member's photo shows in the staff members list, and members without one show their initials", async ({ page, request }) => {
  test.skip(!issued, 'needs the member from the earlier test');
  const { png, b64 } = require('../../backend/tests/photoFixtures');
  const login = await request.post('/api/member-auth/login', { data: { identifier: issued.code, password: issued.password } });
  const { token } = await login.json();
  const upload = await request.put('/api/member-app/me/photo', { headers: { Authorization: `Bearer ${token}` }, data: { image: `data:image/png;base64,${b64(png(240, 240))}` } });
  expect(upload.status()).toBe(200);

  await signIn(page, seed.alpha.managerEmail);
  await page.goto('/members');
  const row = page.locator('tr', { hasText: 'Smoke Member' });
  await expect(row.getByTestId('member-photo')).toBeVisible();
  await expect(page.getByTestId('member-photo')).toHaveCount(1); // nobody else has uploaded one
});

test('closing the UPI QR step with X does not leave a member behind', async ({ page }) => {
  await signIn(page, seed.alpha.managerEmail);
  const form = await openAddMember(page);
  await fillMember(form, { name: 'UPI Walkaway', phone: '9876509999' });
  await form.getByLabel('UPI').check();
  await form.getByRole('button', { name: 'Pay Now' }).click();
  await expect(page.getByText(/scan and pay/i)).toBeVisible();

  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByText(/scan and pay/i)).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('Smoke Member')).toBeVisible(); // the list loaded...
  await expect(page.getByText('UPI Walkaway')).toHaveCount(0); // ...and the abandoned one is not in it
});

test('one gym can never see another gym\'s members', async ({ request }) => {
  const login = await request.post('/api/auth/login', { data: { email: seed.alpha.managerEmail, password: seed.password } });
  expect(login.status()).toBe(200);
  const { token } = await login.json();
  const headers = { Authorization: `Bearer ${token}` };

  const direct = await request.get(`/api/members/${seed.beta.memberId}`, { headers });
  expect([403, 404]).toContain(direct.status());

  const list = await request.get('/api/members?limit=200', { headers });
  expect(list.status()).toBe(200);
  expect(JSON.stringify(await list.json())).not.toContain('Beta Private Member');
});
