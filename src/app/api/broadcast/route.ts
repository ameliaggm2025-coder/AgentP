import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { isAuthed } from '@/lib/session';
import { multicast, text } from '@/lib/line';
import type { LineUser } from '@/lib/types';

/** 群發推播：對全體或指定標籤好友發送文字訊息 */
export async function POST(req: Request) {
  if (!isAuthed()) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const title: string = body?.title?.trim();
  const content: string = body?.content?.trim();
  const audience: string = body?.audience || 'all';
  if (!title || !content) {
    return NextResponse.json({ error: '標題與內容為必填' }, { status: 400 });
  }

  const sb = supabaseAdmin();

  // 找出行銷 agent
  const { data: agent } = await sb.from('agents').select('id').eq('type', 'marketing').single();

  // 取收件對象
  let query = sb.from('line_users').select('line_user_id').eq('status', 'active');
  if (audience !== 'all') query = query.contains('tags', [audience]);
  const { data: users, error: uErr } = await query;
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });

  const ids = (users as Pick<LineUser, 'line_user_id'>[]).map((u) => u.line_user_id);
  const messages = [text(content)];

  // 建立 broadcast 紀錄
  const { data: bc } = await sb
    .from('broadcasts')
    .insert({
      agent_id: agent?.id ?? null,
      title,
      message: messages,
      audience,
      status: 'sending',
    })
    .select()
    .single();

  if (ids.length === 0) {
    if (bc) await sb.from('broadcasts').update({ status: 'sent', sent_count: 0, sent_at: new Date().toISOString() }).eq('id', bc.id);
    return NextResponse.json({ ok: true, sent: 0, note: '目前沒有符合條件的好友' });
  }

  // Line multicast 一次最多 500 人，分批送
  let sent = 0;
  const errors: string[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    const batch = ids.slice(i, i + 500);
    try {
      await multicast(batch, messages);
      sent += batch.length;
    } catch (e) {
      errors.push((e as Error).message);
    }
  }

  const status = errors.length && sent === 0 ? 'failed' : 'sent';
  if (bc) {
    await sb
      .from('broadcasts')
      .update({ status, sent_count: sent, sent_at: new Date().toISOString() })
      .eq('id', bc.id);
  }
  await sb.from('messages').insert({
    agent_id: agent?.id ?? null,
    direction: 'outbound',
    message_type: 'broadcast',
    content: `[${title}] ${content}`,
    status: status === 'sent' ? 'sent' : 'failed',
    error: errors[0] ?? null,
  });

  return NextResponse.json({ ok: errors.length === 0, sent, errors });
}
