import test from 'node:test';
import assert from 'node:assert/strict';
import { welcomeText, whatsappLink } from './welcomeCard.js';

const data = { gymName: 'Iron House', memberName: 'Asha', memberCode: 'FC-1234', email: 'asha@example.com', password: 'Kd7pQm2xRt', appUrl: 'https://iron.fitzyclub.in/member', planName: 'Monthly', validUntil: '18 Dec 2026' };

test('the message carries the username, password and app address', () => {
  const text = welcomeText(data);
  for (const part of ['Iron House', 'Asha', 'FC-1234', 'Kd7pQm2xRt', 'https://iron.fitzyclub.in/member', 'asha@example.com', 'Monthly, valid until 18 Dec 2026']) assert.match(text, new RegExp(part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), part);
});

test('leaves out the email and plan lines when there are none', () => {
  const text = welcomeText({ ...data, email: null, planName: '' });
  assert.doesNotMatch(text, /or your email/);
  assert.doesNotMatch(text, /Plan:/);
});

test('builds a WhatsApp link, adding the country code to a bare 10-digit number', () => {
  const a = whatsappLink('98765 43210', 'hi there');
  assert.equal(a, 'https://wa.me/919876543210?text=hi%20there');
  assert.equal(whatsappLink('+91 98765 43210', 'x'), 'https://wa.me/919876543210?text=x');
  assert.equal(whatsappLink('12345', 'x'), null);
  assert.equal(whatsappLink('', 'x'), null);
});
