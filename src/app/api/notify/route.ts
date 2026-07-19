import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { push, text } from '@/lib/line';

/**
 * 交易通知 API — 給外部系統（訂單/金流/物流）呼叫。
 *
 * POST /api/notify
 * Header: Authorization: Bearer <NOTIFY_API_KEY>
 * Body:   { "to": "<lineUserId>", "event": "shipped", "message": "您的訂單已出貨 🚚" }
 *
 * to 可為單一字串或字串陣列。
 */
export async function POST(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  const key = auth.replace(/^Bearer\s+/i, '');
  if (!process.env.NOTIFY_API_KEY || key !== process.env.NOTIFY_API_KEY) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const toRaw = body?.to;
  const message: string = (body?.message ?? '').toString().trim();
  const event: string = body?.event ?? '';
  if (!toRaw || !message) {
    return NextResponse.json({ error: 'to 與 message 為必填' }, { status: 400 });
  }
  const recipients: string[] = Array.isArray(toRaw) ? toRaw : [toRaw];

  const sb = supabaseAdmin();
  const { data: agent } = await sb.from('agents').select('id').eq('type', 'transactional').single();

  let sent = 0;
  const errors: string[] = [];
  for (const uid of recipients) {
    try {
      await push(uid, [text(message)]);
      sent++;
      await sb.from('messages').insert({
        agent_id: agent?.id ?? null,
        line_user_id: uid,
        direction: 'outbound',
        message_type: 'push',
        content: event ? `[${event}] ${message}` : message,
        status: 'sent',
      });
    } catch (e) {
      errors.push(`${uid}: ${(e as Error).message}`);
      await sb.from('messages').insert({
        agent_id: agent?.id ?? null,
        line_user_id: uid,
        direction: 'outbound',
        message_type: 'push',
        content: event ? `[${event}] ${message}` : message,
        status: 'failed',
        error: (e as Error).message,
      });
    }
  }

  return NextResponse.json({ ok: errors.length === 0, sent, errors });
}
