import { cookies } from 'next/headers';
import { AUTH_COOKIE, verifySessionToken } from './auth';

/** 在 server component / route handler 內檢查是否已登入後台 */
export function isAuthed(): boolean {
  const token = cookies().get(AUTH_COOKIE)?.value;
  return verifySessionToken(token);
}
