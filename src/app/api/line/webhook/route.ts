import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { verifySignature, reply, getProfile, text } from '@/lib/line';
import { chatComplete, openaiConfigured } from '@/lib/openai';
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
  const { data: agentRow } = await sb
    .from('agents')
    .select('*')
    .eq('type', 'customer_service')
    .eq('enabled', true)
    .single();
  const agent = agentRow as Agent | null;

  if (!agent) return; // 客服 agent 停用則不自動回覆

  const { data: rules } = await sb
    .from('auto_replies')
    .select('*')
    .eq('agent_id', agent.id)
    .eq('enabled', true)
    .order('priority', { ascending: false });

  const cfg = agent.config as {
    fallback_reply?: string;
    ai_enabled?: boolean;
    system_prompt?: string;
  };
  const fallback = cfg?.fallback_reply ?? '感謝您的訊息，我們會盡快回覆您 🙏';

  const matched = (rules as AutoReply[] | null)?.find((r) => incoming.includes(r.keyword));

  let replyText: string;
  let source: 'rule' | 'ai' | 'fallback';

  if (matched) {
    // 1) 關鍵字規則優先（快、免費、可控）
    replyText = matched.reply_text;
    source = 'rule';
  } else if (openaiConfigured() && cfg?.ai_enabled !== false) {
    // 2) 沒命中規則 → 交給 OpenAI 生成回覆
    try {
      const systemPrompt =
        cfg?.system_prompt ??
        [
          '你是一個電商 Line 官方帳號的客服助理，請用繁體中文、親切簡潔地回覆顧客。',
          '回覆控制在 2~3 句內，必要時可用 1 個 emoji。',
          '若顧客問到你無法確定的資訊（如特定訂單狀態、金額、個資），請引導他留下訂單編號並說明會由專人協助，切勿編造。',
        ].join('\n');
      replyText = await chatComplete(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: incoming },
        ],
        { maxTokens: 400 }
      );
      source = 'ai';
    } catch (e) {
      console.error('OpenAI 回覆失敗，改用預設語', e);
      replyText = fallback;
      source = 'fallback';
    }
  } else {
    // 3) 沒開 AI → 預設語
    replyText = fallback;
    source = 'fallback';
  }

  await reply(replyToken, [text(replyText)]);
  await sb.from('messages').insert({
    agent_id: agent.id,
    line_user_id: userId ?? null,
    direction: 'outbound',
    message_type: source === 'ai' ? 'ai_reply' : 'reply',
    content: replyText,
    status: 'sent',
  });
}
