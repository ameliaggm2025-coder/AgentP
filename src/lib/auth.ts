import crypto from 'crypto';

export const AUTH_COOKIE = 'line_admin_session';

function secret() {
  return process.env.AUTH_SECRET || 'dev-insecure-secret';
}

/** 產生一個簽章 token，登入成功後寫入 httpOnly cookie */
export function makeSessionToken(): string {
  const payload = `ok.${Date.now()}`;
  const sig = crypto.createHmac('sha256', secret()).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

/** 驗證 cookie 內的 session token 是否有效（7 天內） */
export function verifySessionToken(tokenValue: string | undefined): boolean {
  if (!tokenValue) return false;
  const parts = tokenValue.split('.');
  if (parts.length !== 3) return false;
  const [prefix, ts, sig] = parts;
  const payload = `${prefix}.${ts}`;
  const expected = crypto.createHmac('sha256', secret()).update(payload).digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  const age = Date.now() - Number(ts);
  return age >= 0 && age < 7 * 24 * 60 * 60 * 1000;
}

export function checkPassword(input: string): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(pw);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
