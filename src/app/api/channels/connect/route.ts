import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/session';
import { connectChannel, disconnectChannel } from '@/lib/channels';

/**
 * 後台頁面用的頻道連線 API，以登入 session cookie 保護（不需 NOTIFY_API_KEY）。
 * 讓管理者在瀏覽器貼上 channel secret / access token 即可上線，金鑰只走 server。
 * body: { role_code, channel_secret, channel_access_token, channel_id?, action? }
 * action='disconnect' 則解除連線並停用。
 */
export async function POST(req: Request) {
  if (!isAuthed()) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);

  if (body?.action === 'disconnect') {
    const r = await disconnectChannel(body?.role_code);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true });
  }

  const result = await connectChannel({
    roleCode: body?.role_code,
    secret: body?.channel_secret,
    token: body?.channel_access_token,
    channelId: body?.channel_id ?? null,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}
