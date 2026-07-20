import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getBotInfo } from '@/lib/line';
import type { Agent } from '@/lib/types';

/**
 * 註冊 / 更新某公司角色的 LINE OA 金鑰（多租戶）。
 * 以 x-api-key: NOTIFY_API_KEY 保護（server 對 server）。
 * body: { role_code, channel_id?, channel_secret, channel_access_token }
 * 會自動用 access token 呼叫 /v2/bot/info 取得 destination(bot userId) 並寫入 config。
 */
export async function POST(req: Request) {
  const apiKey = req.headers.get('x-api-key');
  if (!process.env.NOTIFY_API_KEY || apiKey !== process.env.NOTIFY_API_KEY) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const roleCode: string = body?.role_code;
  const secret: string = body?.channel_secret;
  const token: string = body?.channel_access_token;
  if (!roleCode || !secret || !token) {
    return NextResponse.json(
      { error: 'role_code, channel_secret, channel_access_token 為必填' },
      { status: 400 }
    );
  }

  // 用 access token 取得該 OA 的 bot userId（= webhook 的 destination）
  const info = await getBotInfo(token);
  if (!info?.userId) {
    return NextResponse.json(
      { error: '無法用該 access token 取得 bot 資訊，請確認 token 正確' },
      { status: 400 }
    );
  }

  const sb = supabaseAdmin();
  const { data: found } = await sb
    .from('agents')
    .select('*')
    .eq('config->>role_code', roleCode)
    .limit(1);
  const agent = found?.[0] as Agent | undefined;
  if (!agent) {
    return NextResponse.json({ error: `找不到 role_code=${roleCode} 的角色` }, { status: 404 });
  }

  const newConfig = {
    ...(agent.config as Record<string, unknown>),
    line_channel_id: body?.channel_id ?? null,
    line_channel_secret: secret,
    line_channel_access_token: token,
    line_destination: info.userId,
  };

  const { error } = await sb
    .from('agents')
    .update({ config: newConfig, enabled: true })
    .eq('id', agent.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    company: (agent.config as { company?: string }).company ?? null,
    role_code: roleCode,
    destination: info.userId,
    bot: info.basicId ?? info.displayName ?? null,
  });
}
