import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { verifySignature, reply, getProfile, text } from '@/lib/line';
import type { Agent, AutoReply } from '@/lib/types';

export const dynamic = 'force-dynamic';

// Line 驗證 webhook URL 時會送空的 events，直接回 200
export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get('x-line-signature');

  if (!verifySignature(raw, signature)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  let events: any[] = [];
  try {
    events = JSON.parse(raw).events ?? [];
  } catch {
    return NextResponse.json({ ok: true });
  }

  const sb = supabaseAdmin();

  for (const ev of events) {
    const userId: string | undefined = ev.source?.userId;
    try {
      if (ev.type === 'follow' && userId) {
        const profile = await getProfile(userId);
        await sb.from('line_users').upsert(
          {
            line_user_id: userId,
            display_name: profile?.displayName ?? null,
            picture_url: profile?.pictureUrl ?? null,
            status: 'active',
          },
          { onConflict: 'line_user_id' }
        );
        await sb.from('messages').insert({
          line_user_id: userId,
          direction: 'inbound',
          message_type: 'receive',
          content: '（加入好友）',
          status: 'received',
        });
      } else if (ev.type === 'unfollow' && userId) {
        await sb.from('line_users').update({ status: 'blocked' }).eq('line_user_id', userId);
      } else if (ev.type === 'message' && ev.message?.type === 'text') {
        const incoming: string = ev.message.text ?? '';
        await sb.from('messages').insert({
          line_user_id: userId ?? null,
          direction: 'inbound',
          message_type: 'receive',
          content: incoming,
          status: 'received',
        });
        await handleCustomerService(sb, ev.replyToken, incoming, userId);
      }
    } catch (e) {
      // 單一事件失敗不影響其他事件；仍回 200 避免 Line 重送
      console.error('webhook event error', e);
    }
  }

  return NextResponse.json({ ok: true });
}

async function handleCustomerService(
  sb: ReturnType<typeof supabaseAdmin>,
  replyToken: string,
  incoming: string,
  userId?: string
) {
  const { data: agent } = await sb
    .from('agents')
    .select('*')
    .eq('type', 'customer_service')
    .eq('enabled', true)
    .single<Agent>();

  if (!agent) return; // 客服 agent 停用則不自動回覆

  const { data: rules } = await sb
    .from('auto_replies')
    .select('*')
    .eq('agent_id', agent.id)
    .eq('enabled', true)
    .order('priority', { ascending: false });

  const matched = (rules as AutoReply[] | null)?.find((r) => incoming.includes(r.keyword));
  const fallback =
    (agent.config as { fallback_reply?: string })?.fallback_reply ??
    '感謝您的訊息，我們會盡快回覆您 🙏';
  const replyText = matched?.reply_text ?? fallback;

  await reply(replyToken, [text(replyText)]);
  await sb.from('messages').insert({
    agent_id: agent.id,
    line_user_id: userId ?? null,
    direction: 'outbound',
    message_type: 'reply',
    content: replyText,
    status: 'sent',
  });
}
