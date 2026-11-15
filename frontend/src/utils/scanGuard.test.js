import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraProblem, looksLikePass, SAME_CODE_MS, shouldHandle, STILL_IN_VIEW_MS } from './scanGuard.js';

const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMiLCJwdXJwb3NlIjoiY2hlY2tpbiJ9.c2lnbmF0dXJlLXZhbHVl';

test('the same code is ignored for a short while after it was handled, then allowed again once it has left the view', () => {
  const last = { token: TOKEN, at: 1000, seenAt: 1000 };
  assert.equal(shouldHandle({ last, token: TOKEN, now: 1000 + 500 }), false);
  assert.equal(shouldHandle({ last, token: TOKEN, now: 1000 + SAME_CODE_MS - 1 }), false);
  assert.equal(shouldHandle({ last, token: TOKEN, now: 1000 + SAME_CODE_MS }), true);
});

test('a code that stays in front of the camera is never counted again, however long it stays', () => {
  const handledAt = 1000;
  // the camera keeps seeing it, so seenAt keeps moving forward
  const stillThere = { token: TOKEN, at: handledAt, seenAt: handledAt + 60000 - 100 };
  assert.equal(shouldHandle({ last: stillThere, token: TOKEN, now: handledAt + 60000 }), false);
  // once it has been gone for a moment and the wait since it was handled is over, the same pass can be scanned again
  const gone = { token: TOKEN, at: handledAt, seenAt: handledAt + 4000 };
  assert.equal(shouldHandle({ last: gone, token: TOKEN, now: handledAt + 4000 + STILL_IN_VIEW_MS }), false); // gone, but the 15 second wait is not over
  assert.equal(shouldHandle({ last: gone, token: TOKEN, now: handledAt + SAME_CODE_MS }), true);
});

test('a different code, or the very first one, is always handled', () => {
  assert.equal(shouldHandle({ last: { token: TOKEN, at: 1000 }, token: `${TOKEN}x`, now: 1001 }), true);
  assert.equal(shouldHandle({ last: null, token: TOKEN, now: 1 }), true);
});

test('recognises the shape of a pass and rejects other QR codes', () => {
  assert.equal(looksLikePass(TOKEN), true);
  assert.equal(looksLikePass('https://fitzyclub.in/member'), false); // the member-app poster
  assert.equal(looksLikePass('upi://pay?pa=a@b'), false);
  assert.equal(looksLikePass('short.a.b'), false);
  assert.equal(looksLikePass(`${'a'.repeat(1000)}.b.c`), false);
  assert.equal(looksLikePass(undefined), false);
});

test('explains camera trouble in plain words', () => {
  assert.match(cameraProblem({ name: 'NotAllowedError' }), /blocked/);
  assert.match(cameraProblem({ name: 'NotFoundError' }), /No camera/);
  assert.match(cameraProblem({ name: 'NotReadableError' }), /another app/);
  assert.match(cameraProblem({}, { secure: false }), /https/);
  assert.match(cameraProblem(new Error('x')), /Could not start/);
});
