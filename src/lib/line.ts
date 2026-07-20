import crypto from 'crypto';
import type { LineMessage } from './types';

const API = 'https://api.line.me/v2/bot';

/** 預設 access token（單一 OA / 向後相容）取自環境變數 */
function envToken() {
  const t = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!t) throw new Error('LINE_CHANNEL_ACCESS_TOKEN 未設定');
  return t;
}

function headers(token?: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token || envToken()}`,
  };
}

/**
 * 驗證 Line webhook 的 X-Line-Signature（HMAC-SHA256 + base64）。
 * @param body 原始 request body 字串（不可先 JSON.parse）
 * @param secret 該 OA 的 channel secret；未帶則用環境變數（單一 OA）
 */
export function verifySignature(
  body: string,
  signature: string | null,
  secret?: string
): boolean {
  const s = secret || process.env.LINE_CHANNEL_SECRET;
  if (!s || !signature) return false;
  const hash = crypto.createHmac('sha256', s).update(body).digest('base64');
  const a = Buffer.from(hash);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function callLine(path: string, payload: unknown, token?: string) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Line API ${path} ${res.status}: ${text}`);
  }
  return res;
}

/** 回覆訊息（用 webhook 事件的 replyToken，免費且不計入額度） */
export function reply(replyToken: string, messages: LineMessage[], token?: string) {
  return callLine('/message/reply', { replyToken, messages }, token);
}

/** 主動推播給單一使用者 */
export function push(to: string, messages: LineMessage[], token?: string) {
  return callLine('/message/push', { to, messages }, token);
}

/** 群發給多位使用者（一次最多 500 個 userId） */
export function multicast(to: string[], messages: LineMessage[], token?: string) {
  return callLine('/message/multicast', { to, messages }, token);
}

/** 取得使用者 profile（顯示名稱、頭像） */
export async function getProfile(userId: string, token?: string) {
  const res = await fetch(`${API}/profile/${userId}`, { headers: headers(token) });
  if (!res.ok) return null;
  return (await res.json()) as {
    userId: string;
    displayName: string;
    pictureUrl?: string;
  };
}

/** 取得 bot 自身資訊（含 userId，用來對應 webhook 的 destination） */
export async function getBotInfo(token: string) {
  const res = await fetch(`${API}/info`, { headers: headers(token) });
  if (!res.ok) return null;
  return (await res.json()) as { userId: string; basicId?: string; displayName?: string };
}

/** 便捷：把純文字包成 Line 文字訊息 */
export function text(msg: string): LineMessage {
  return { type: 'text', text: msg };
}
