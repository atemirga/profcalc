// tests/telegram-auth.test.js — Telegram WebApp initData verification
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyInitData } from '../server/telegram-auth.js';

function buildInitData(token, fields) {
  const params = new URLSearchParams(fields);
  const dataCheck = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = crypto.createHmac('sha256', secret).update(dataCheck).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

test('verifyInitData accepts a valid signature', () => {
  const token = 'TEST:TOKEN-123';
  const initData = buildInitData(token, {
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: 12345, first_name: 'Айдар' }),
    query_id: 'q1',
  });
  const v = verifyInitData(initData, token);
  assert.ok(v, 'returns object');
  assert.ok(v.user);
  assert.equal(v.user.id, 12345);
});

test('verifyInitData rejects a tampered signature', () => {
  const token = 'TEST:TOKEN-123';
  const valid = buildInitData(token, { auth_date: '1', user: JSON.stringify({ id: 1 }) });
  // flip the user id
  const tampered = valid.replace('id%22%3A1', 'id%22%3A999');
  const v = verifyInitData(tampered, token);
  assert.equal(v, null);
});

test('verifyInitData rejects empty input', () => {
  assert.equal(verifyInitData('', 'tok'), null);
  assert.equal(verifyInitData(null, 'tok'), null);
});
