import { NextResponse } from 'next/server';
import { connectChannel } from '@/lib/channels';

/**
 * 註冊 / 更新某公司角色的 LINE OA 金鑰（多租戶，server 對 server）。
 * 以 x-api-key: NOTIFY_API_KEY 保護。
 * body: { role_code, channel_id?, channel_secret, channel_access_token }
 * 會自動用 access token 取得 destination(bot userId) 並寫入 config，成功後上線。
 */
export async function POST(req: Request) {
  const apiKey = req.headers.get('x-api-key');
  if (!process.env.NOTIFY_API_KEY || apiKey !== process.env.NOTIFY_API_KEY) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const result = await connectChannel({
    roleCode: body?.role_code,
    secret: body?.channel_secret,
    token: body?.channel_access_token,
    channelId: body?.channel_id ?? null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({
    ok: true,
    company: result.company,
    role_code: result.role_code,
    destination: result.destination,
    bot: result.bot,
  });
}
