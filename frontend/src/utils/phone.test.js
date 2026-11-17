import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidPhone, phoneProps } from './phone.js';

test('accepts ordinary numbers in the usual formats', () => {
  for (const ok of ['9876543210', '98765 43210', '+91 98765 43210', '098-7654-3210', '(080) 2345 6789', '+1 (415) 555-0132']) {
    assert.equal(isValidPhone(ok), true, ok);
  }
});

test('refuses numbers that are too short, too long, or not numbers', () => {
  for (const bad of ['', '9', '98765', '987654321', '9'.repeat(16), '+91 9876543210 12345', 'not-a-phone!!', '98765abcde', '++919876543210', '9876543210 ext 5']) {
    assert.equal(isValidPhone(bad), false, bad);
  }
});

test('the input pattern agrees with the check', () => {
  const re = new RegExp(`^(?:${phoneProps.pattern})$`);
  for (const v of ['9876543210', '+91 98765 43210', '(080) 2345 6789']) assert.equal(re.test(v), true, v);
  for (const v of ['9', '987654321', '9'.repeat(16), 'abcdefghij']) assert.equal(re.test(v), false, v);
});
