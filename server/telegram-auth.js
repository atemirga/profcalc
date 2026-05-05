// server/telegram-auth.js — verify Telegram WebApp initData per
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
import crypto from 'node:crypto';

export function verifyInitData(initData, botToken) {
  if (!initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calc = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (calc !== hash) return null;

  // Optional auth_date freshness check (24h)
  const authDate = parseInt(params.get('auth_date') || '0', 10);
  if (!authDate || (Date.now() / 1000 - authDate) > 86400) {
    // expired but still return data so callers can decide
  }

  const userJson = params.get('user');
  let user = null;
  if (userJson) try { user = JSON.parse(userJson); } catch {}
  return { user, authDate, raw: Object.fromEntries(params.entries()) };
}
