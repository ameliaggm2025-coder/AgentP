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

type Channel = {
  agent: Agent | null;
  secret?: string; // 該 OA 的 channel secret（多租戶）
  token?: string; // 該 OA 的 access token（多租戶）
};

// 圖文選單可切換的角色（存在 agent.config.menu_roles 陣列）
interface MenuRole {
  key: string; // 角色識別碼，如 'copywriter'
  keyword: string; // 圖文選單按鈕送出的文字，如 '切換｜文案手'
  label: string; // 顯示名稱
  system_prompt: string; // 切到此角色後使用的提示詞
}

/**
 * 依 webhook payload 的 destination（該 OA 的 bot userId）找出對應公司角色。
 * 多租戶：一支 webhook 服務多家 OA。
 * 找不到對應（或 config 未設 line_destination）→ 回退單一 OA（用環境變數）。
 */
async function resolveChannel(
  sb: ReturnType<typeof supabaseAdmin>,
  destination: string | undefined
): Promise<Channel> {
  // 1) 多租戶：以 destination 對應到某公司角色
  if (destination) {
    const { data } = await sb
      .from('agents')
      .select('*')
      .eq('type', 'customer_service')
      .eq('enabled', true)
      .eq('config->>line_destination', destination)
      .limit(1);
    const agent = (data?.[0] as Agent | undefined) ?? null;
    if (agent) {
      const cfg = agent.config as {
        line_channel_secret?: string;
        line_channel_access_token?: string;
      };
      return { agent, secret: cfg.line_channel_secret, token: cfg.line_channel_access_token };
    }
  }
  // 2) 回退：單一 OA（環境變數 secret/token）＋任一啟用的 customer_service（優先未設 line_destination 者）
  const { data: fallback } = await sb
    .from('agents')
    .select('*')
    .eq('type', 'customer_service')
    .eq('enabled', true)
    .order('updated_at', { ascending: true })
    .limit(1);
  return { agent: (fallback?.[0] as Agent | undefined) ?? null };
}

export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get('x-line-signature');

  let parsed: { destination?: string; events?: unknown[] } = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true });
  }

  const sb = supabaseAdmin();
  const channel = await resolveChannel(sb, parsed.destination);

  // 用該 OA 的 secret（多租戶）或環境變數（單一 OA）驗簽
  if (!verifySignature(raw, signature, channel.secret)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  const events = (parsed.events ?? []) as any[];
  const token = channel.token; // undefined → line.ts 用環境變數 token

  for (const ev of events) {
    const userId: string | undefined = ev.source?.userId;
    try {
      if (ev.type === 'follow' && userId) {
        const profile = await getProfile(userId, token);
        await sb.from('line_users').upsert(
          {
            line_user_id: userId,
            display_name: profile?.displayName ?? null,
            picture_url: profile?.pictureUrl ?? null,
            status: 'active',
            tags: channel.agent?.config
              ? [(channel.agent.config as { company?: string }).company ?? '']
                  .filter(Boolean)
              : [],
          },
          { onConflict: 'line_user_id' }
        );
        await sb.from('messages').insert({
          agent_id: channel.agent?.id ?? null,
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
          agent_id: channel.agent?.id ?? null,
          line_user_id: userId ?? null,
          direction: 'inbound',
          message_type: 'receive',
          content: incoming,
          status: 'received',
        });
        await handleCustomerService(sb, channel.agent, ev.replyToken, incoming, userId, token);
      }
    } catch (e) {
      console.error('webhook event error', e);
    }
  }

  return NextResponse.json({ ok: true });
}

async function handleCustomerService(
  sb: ReturnType<typeof supabaseAdmin>,
  agent: Agent | null,
  replyToken: string,
  incoming: string,
  userId: string | undefined,
  token: string | undefined
) {
  if (!agent) return; // 沒有對應角色則不自動回覆

  const cfg = agent.config as {
    fallback_reply?: string;
    ai_enabled?: boolean;
    system_prompt?: string;
    menu_roles?: MenuRole[];
  };
  const menuRoles = Array.isArray(cfg.menu_roles) ? cfg.menu_roles : [];

  // 重置：切回該 OA 的預設角色（清掉該使用者在此 agent 的選擇），靜默不回覆
  if (userId && incoming.trim() === '切換｜預設') {
    try {
      await sb.from('line_user_menu').delete().eq('line_user_id', userId).eq('agent_id', agent.id);
    } catch (e) {
      console.error('重置角色失敗', e);
    }
    return;
  }

  // 圖文選單「角色切換」：訊息剛好等於某按鈕關鍵字 → 靜默切換該使用者角色，不回覆
  if (userId && menuRoles.length) {
    const hit = menuRoles.find((r) => r.keyword && incoming.trim() === r.keyword.trim());
    if (hit) {
      try {
        await sb.from('line_user_menu').upsert(
          {
            line_user_id: userId,
            agent_id: agent.id,
            role_key: hit.key,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'line_user_id,agent_id' }
        );
      } catch (e) {
        console.error('角色切換寫入失敗', e);
      }
      return; // 不回確認訊息，直接切
    }
  }

  // 依使用者目前選的角色決定生效的 system prompt；未選則用該 OA 預設角色
  let effectivePrompt = cfg.system_prompt;
  if (userId && menuRoles.length) {
    try {
      const { data: state } = await sb
        .from('line_user_menu')
        .select('role_key')
        .eq('line_user_id', userId)
        .eq('agent_id', agent.id)
        .limit(1);
      const roleKey = (state?.[0] as { role_key?: string } | undefined)?.role_key;
      const sel = roleKey ? menuRoles.find((r) => r.key === roleKey) : undefined;
      if (sel?.system_prompt) effectivePrompt = sel.system_prompt;
    } catch (e) {
      console.error('讀取使用者角色失敗', e);
    }
  }

  const { data: rules } = await sb
    .from('auto_replies')
    .select('*')
    .eq('agent_id', agent.id)
    .eq('enabled', true)
    .order('priority', { ascending: false });

  const fallback = cfg?.fallback_reply ?? '感謝您的訊息，我們會盡快回覆您 🙏';

  const matched = (rules as AutoReply[] | null)?.find((r) => incoming.includes(r.keyword));

  let replyText: string;
  let source: 'rule' | 'ai' | 'fallback';

  if (matched) {
    replyText = matched.reply_text;
    source = 'rule';
  } else if (openaiConfigured() && cfg?.ai_enabled !== false && effectivePrompt) {
    try {
      replyText = await chatComplete(
        [
          { role: 'system', content: effectivePrompt },
          { role: 'user', content: incoming },
        ],
        { maxTokens: 500 }
      );
      source = 'ai';
    } catch (e) {
      console.error('OpenAI 回覆失敗，改用預設語', e);
      replyText = fallback;
      source = 'fallback';
    }
  } else {
    replyText = fallback;
    source = 'fallback';
  }

  await reply(replyToken, [text(replyText)], token);
  await sb.from('messages').insert({
    agent_id: agent.id,
    line_user_id: userId ?? null,
    direction: 'outbound',
    message_type: source === 'ai' ? 'ai_reply' : 'reply',
    content: replyText,
    status: 'sent',
  });
}
