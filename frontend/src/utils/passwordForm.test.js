import test from 'node:test';
import assert from 'node:assert/strict';
import { passwordFormProblem } from './passwordForm.js';

const ok = { current: 'old-Pass-1', next: 'new-Pass-22', confirm: 'new-Pass-22' };

test('a complete, matching form is fine to send', () => {
  assert.equal(passwordFormProblem(ok), null);
});

test('asks for the current password first', () => {
  assert.match(passwordFormProblem({ ...ok, current: '' }), /current password/i);
});

test('the new password must be 8 to 72 characters', () => {
  assert.match(passwordFormProblem({ ...ok, next: 'short1', confirm: 'short1' }), /at least 8/);
  const long = 'x'.repeat(73);
  assert.match(passwordFormProblem({ ...ok, next: long, confirm: long }), /72/);
  const edge = 'a1B2c3D4';
  assert.equal(passwordFormProblem({ current: 'old-Pass-1', next: edge, confirm: edge }), null);
});

test('refuses keeping the same password, and a confirmation that does not match', () => {
  assert.match(passwordFormProblem({ current: 'same-Pass-1', next: 'same-Pass-1', confirm: 'same-Pass-1' }), /different/);
  assert.match(passwordFormProblem({ ...ok, confirm: 'new-Pass-23' }), /do not match/);
});
