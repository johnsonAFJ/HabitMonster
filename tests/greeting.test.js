import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GREETING, shouldGreet } from '../js/greeting.js';

const card = { id: 'trip', until: '2026-10-08' };

test('a greeting shows until he clears it', () => {
  assert.equal(shouldGreet(card, '2026-10-03', false), true);
  assert.equal(shouldGreet(card, '2026-10-03', true), false, 'cleared on this device');
});

test('a greeting stops on its own after its last day', () => {
  assert.equal(shouldGreet(card, '2026-10-08', false), true, 'the last day still counts');
  assert.equal(shouldGreet(card, '2026-10-09', false), false);
});

test('no greeting, no card', () => {
  assert.equal(shouldGreet(null, '2026-10-03', false), false);
});

test('the current greeting is well formed', () => {
  assert.match(GREETING.until, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(typeof GREETING.message('Sparky'), 'string');
  assert.ok(GREETING.message('Sparky').includes('Sparky'));
});
