import { chatComplete, openaiConfigured } from './openai';
import {
  gcalConfigured,
  insertEvent,
  listEvents,
  type CalendarEvent,
} from './gcal';

/**
 * 私人小助理：把使用者用自然語言丟進來的行程（例如「森合 8/5 下午2點 開會」）
 * 解析成公司／日期／時間／標題，依公司配色寫進個人 Google 日曆並回覆確認。
 * 也支援查詢（例如「明天有什麼」）。
 */

// 五家公司 → Google 事件顏色（colorId 1-11）與別名
interface CompanyDef {
  name: string; // 顯示用正式名稱
  colorId: string;
  aliases: string[]; // 使用者可能打的別名（小寫比對）
}

const COMPANIES: CompanyDef[] = [
  { name: '群曜', colorId: '7', aliases: ['群曜', 'qunyao', '群曜醫電'] }, // 孔雀藍
  { name: '森合', colorId: '10', aliases: ['森合', 'senhe', '森合生技'] }, // 羅勒綠
  { name: '生寶', colorId: '5', aliases: ['生寶', 'shengbao', '生寶生技'] }, // 香蕉黃
  { name: '康亮', colorId: '6', aliases: ['康亮', 'kangliang'] }, // 橘
  { name: 'ANZO', colorId: '3', aliases: ['anzo', '安佐'] }, // 葡萄紫
];
const DEFAULT_COLOR = '8'; // 石墨灰（未指定公司）

function resolveCompany(input: string | undefined): CompanyDef | null {
  if (!input) return null;
  const q = input.trim().toLowerCase();
  if (!q) return null;
  return (
    COMPANIES.find((c) => c.aliases.some((a) => a.toLowerCase() === q)) ??
    COMPANIES.find((c) => c.aliases.some((a) => q.includes(a.toLowerCase()))) ??
    null
  );
}

interface Parsed {
  action: 'add' | 'list' | 'help';
  company?: string;
  date?: string; // YYYY-MM-DD
  date_end?: string; // YYYY-MM-DD（查詢區間用）
  start_time?: string; // HH:MM
  end_time?: string; // HH:MM
  title?: string;
}

/** 台北時區的今日日期字串（UTC+8，無日光節約）。 */
function taipeiToday(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
function weekday(date: string): string {
  return WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
}
/** 8/5（二） */
function humanDate(date: string): string {
  const [, m, d] = date.split('-');
  return `${Number(m)}/${Number(d)}（${weekday(date)}）`;
}

/** 從模型輸出中抽出 JSON（容忍 ```json 包裝）。 */
function extractJson(raw: string): Parsed | null {
  const cleaned = raw
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as Parsed;
  } catch {
    return null;
  }
}

async function parseMessage(incoming: string): Promise<Parsed | null> {
  const today = taipeiToday();
  const system = `你是行事曆解析器。把使用者訊息解析成 JSON，只輸出 JSON、不要多餘文字。
今天是 ${today}（${weekday(today)}），時區台北。相對日期（今天/明天/後天/下週三…）請換算成實際日期。
公司只能是這五家其中之一或空字串：群曜、森合、生寶、康亮、ANZO。
欄位：
- action: "add"（新增行程）｜"list"（查詢某天有什麼）｜"help"（看不懂或問功能）
- company: 五家之一，或 ""
- date: "YYYY-MM-DD"，新增或查詢的日期；沒提到就 ""
- date_end: 查詢區間的結束日 "YYYY-MM-DD"，沒有就 ""
- start_time: "HH:MM" 24小時制，沒提到就 ""
- end_time: "HH:MM"，沒提到就 ""
- title: 行程內容（不含公司名與日期），例如 "開會"、"拜訪客戶"；查詢時可為 ""`;

  let out: string;
  try {
    out = await chatComplete(
      [
        { role: 'system', content: system },
        { role: 'user', content: incoming },
      ],
      { temperature: 0, maxTokens: 300 }
    );
  } catch (e) {
    console.error('小助理解析失敗', e);
    return null;
  }
  return extractJson(out);
}

/** HH:MM 加一小時（給沒指定結束時間的事件）。 */
function plusOneHour(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const nh = (h + 1) % 24;
  return `${String(nh).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const HELP =
  '嗨，我是妳的私人行事曆小助理 🗓️\n' +
  '直接把行程丟給我，例如：\n' +
  '・「森合 8/5 下午2點 開會」\n' +
  '・「明天 生寶 拜訪客戶」\n' +
  '・「群曜 8/10 產品會議」\n' +
  '我會自動排進妳的 Google 日曆，並依公司標上不同顏色。\n' +
  '想查行程可以問：「明天有什麼」「8/5 有什麼」。';

/**
 * 處理一則私人小助理訊息，回傳要回覆給使用者的文字。
 */
export async function handleAssistantMessage(incoming: string): Promise<string> {
  const msg = incoming.trim();
  if (!msg) return HELP;
  if (['help', '功能', '說明', '?', '？', '你好', '妳好', 'hi', 'hello'].includes(msg.toLowerCase())) {
    return HELP;
  }
  if (!openaiConfigured()) return '目前無法解析行程（AI 未設定），請稍後再試。';
  if (!gcalConfigured()) return '行事曆尚未設定完成，請稍等一下再試 🙏';

  const parsed = await parseMessage(msg);
  if (!parsed) return '我看不太懂這則行程 🤔 可以試試「森合 8/5 下午2點 開會」這種寫法。';

  if (parsed.action === 'list') {
    return await doList(parsed);
  }
  if (parsed.action === 'add') {
    return await doAdd(parsed);
  }
  return HELP;
}

async function doAdd(p: Parsed): Promise<string> {
  if (!p.date) return '這則行程沒看到日期，麻煩補上日期，例如「森合 8/5 開會」。';
  const company = resolveCompany(p.company);
  const title = (p.title || '行程').trim();
  const summary = company ? `【${company.name}】${title}` : title;
  const colorId = company?.colorId ?? DEFAULT_COLOR;

  try {
    if (p.start_time) {
      const start = `${p.date}T${p.start_time}:00+08:00`;
      const endTime = p.end_time || plusOneHour(p.start_time);
      const end = `${p.date}T${endTime}:00+08:00`;
      await insertEvent({ summary, startDateTime: start, endDateTime: end, colorId });
      return (
        '✅ 已排入 Google 日曆\n' +
        `📅 ${humanDate(p.date)} ${p.start_time}\n` +
        (company ? `🏢 ${company.name}\n` : '') +
        `📝 ${title}`
      );
    }
    await insertEvent({ summary, date: p.date, colorId });
    return (
      '✅ 已排入 Google 日曆（整天）\n' +
      `📅 ${humanDate(p.date)}\n` +
      (company ? `🏢 ${company.name}\n` : '') +
      `📝 ${title}`
    );
  } catch (e) {
    console.error('寫入 Google 日曆失敗', e);
    return '排入日曆時出了點狀況 😥 請稍後再試一次。';
  }
}

async function doList(p: Parsed): Promise<string> {
  const day = p.date || taipeiToday();
  const endDay = p.date_end || day;
  const timeMin = `${day}T00:00:00+08:00`;
  const timeMax = `${endDay}T23:59:59+08:00`;
  let items: CalendarEvent[];
  try {
    items = await listEvents(timeMin, timeMax);
  } catch (e) {
    console.error('查詢日曆失敗', e);
    return '查詢行程時出了點狀況 😥 請稍後再試。';
  }
  if (!items.length) {
    return `${humanDate(day)}${endDay !== day ? `～${humanDate(endDay)}` : ''} 目前沒有行程 🎉`;
  }
  const lines = items.map((ev) => {
    const t = ev.start?.dateTime
      ? new Date(ev.start.dateTime).toLocaleTimeString('zh-TW', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: 'Asia/Taipei',
        })
      : '整天';
    return `・${t}　${ev.summary ?? '(無標題)'}`;
  });
  return `🗓️ ${humanDate(day)}${endDay !== day ? `～${humanDate(endDay)}` : ''} 的行程：\n${lines.join('\n')}`;
}
