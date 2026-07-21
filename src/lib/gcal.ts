import crypto from 'crypto';

/**
 * Google Calendar 串接（服務帳號 / server-to-server）。
 * 沿用本專案「只用原生 fetch + crypto、不引入 SDK」的風格：
 * 自己用服務帳號的私鑰簽 RS256 JWT，向 Google 換 access token，再打 Calendar API。
 *
 * 需要的環境變數：
 *   GOOGLE_SERVICE_ACCOUNT_JSON  服務帳號金鑰的完整 JSON（直接貼下載的檔案內容）
 *   GOOGLE_CALENDAR_ID           目標日曆 ID（通常是你的 Gmail；需先把該日曆分享給服務帳號並給「變更活動」權限）
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CAL_API = 'https://www.googleapis.com/calendar/v3';
const SCOPE = 'https://www.googleapis.com/auth/calendar';
export const TIME_ZONE = 'Asia/Taipei';

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

/** 是否已設定 Google 日曆所需環境變數 */
export function gcalConfigured(): boolean {
  return !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON && !!process.env.GOOGLE_CALENDAR_ID;
}

function serviceAccount(): ServiceAccount {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON 未設定');
  let sa: ServiceAccount;
  try {
    sa = JSON.parse(raw);
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON 不是合法 JSON');
  }
  if (!sa.client_email || !sa.private_key) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON 缺少 client_email 或 private_key');
  }
  return sa;
}

function calendarId(): string {
  const id = process.env.GOOGLE_CALENDAR_ID;
  if (!id) throw new Error('GOOGLE_CALENDAR_ID 未設定');
  return id;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/** 用服務帳號私鑰簽一組 JWT，向 Google 換 OAuth2 access token。 */
async function getAccessToken(): Promise<string> {
  const sa = serviceAccount();
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    })
  );
  const signingInput = `${header}.${claims}`;
  const signature = base64url(
    crypto.createSign('RSA-SHA256').update(signingInput).sign(sa.private_key)
  );
  const assertion = `${signingInput}.${signature}`;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error('Google token 回應無 access_token');
  return json.access_token;
}

export interface CalendarEventInput {
  summary: string; // 事件標題，例如「【森合】開會」
  description?: string;
  /** 全天事件：YYYY-MM-DD；未帶 startTime 時使用 */
  date?: string;
  /** 有時間的事件：ISO 起訖（含 +08:00），優先於 date */
  startDateTime?: string;
  endDateTime?: string;
  colorId?: string; // Google 事件顏色 1-11
}

export interface CalendarEvent {
  id: string;
  summary?: string;
  htmlLink?: string;
  start?: { date?: string; dateTime?: string };
}

/** 在指定日曆新增一筆事件，回傳建立後的事件。 */
export async function insertEvent(input: CalendarEventInput): Promise<CalendarEvent> {
  const token = await getAccessToken();
  const body: Record<string, unknown> = {
    summary: input.summary,
    description: input.description,
  };
  if (input.startDateTime) {
    body.start = { dateTime: input.startDateTime, timeZone: TIME_ZONE };
    body.end = {
      dateTime: input.endDateTime ?? input.startDateTime,
      timeZone: TIME_ZONE,
    };
  } else if (input.date) {
    // 全天事件；Google 的 end.date 為排除值，故 +1 天
    body.start = { date: input.date };
    body.end = { date: addDays(input.date, 1) };
  } else {
    throw new Error('事件需帶 date 或 startDateTime');
  }
  if (input.colorId) body.colorId = input.colorId;

  const res = await fetch(
    `${CAL_API}/calendars/${encodeURIComponent(calendarId())}/events`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    throw new Error(`Calendar insert ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as CalendarEvent;
}

/** 查詢某時間區間的事件（依開始時間排序，展開週期事件）。 */
export async function listEvents(
  timeMinISO: string,
  timeMaxISO: string
): Promise<CalendarEvent[]> {
  const token = await getAccessToken();
  const qs = new URLSearchParams({
    timeMin: timeMinISO,
    timeMax: timeMaxISO,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '50',
  });
  const res = await fetch(
    `${CAL_API}/calendars/${encodeURIComponent(calendarId())}/events?${qs}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    throw new Error(`Calendar list ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { items?: CalendarEvent[] };
  return json.items ?? [];
}

/** YYYY-MM-DD 加 n 天（用 UTC 計算避免時區位移）。 */
function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
