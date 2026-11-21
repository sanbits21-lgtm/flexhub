import test from 'node:test';
import assert from 'node:assert/strict';
import { scrub, startErrorTracking } from './errorTracking.js';

test('removes everything about the person from a browser event', () => {
  const event = scrub({
    message: 'boom',
    request: { url: 'https://iron.fitzyclub.in/members?phone=9876543210#top', headers: { cookie: 'x' } },
    user: { email: 'a@b.com' },
    breadcrumbs: [{ category: 'ui.click', message: 'button.save "Asha"' }],
    extra: { form: 'secret' },
  });
  const text = JSON.stringify(event);
  for (const secret of ['9876543210', 'a@b.com', 'Asha', 'secret', 'cookie', '#top']) assert.equal(text.includes(secret), false, secret);
  assert.equal(event.request.url, 'https://iron.fitzyclub.in/members');
  assert.equal(event.message, 'boom');
});

test('does nothing, and loads nothing, without a DSN', async () => {
  assert.equal(await startErrorTracking(''), false);
});
