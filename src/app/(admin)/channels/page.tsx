import { headers } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase';
import type { Agent } from '@/lib/types';
import ChannelConnectForm, { type ChannelAgentView } from '@/components/ChannelConnectForm';

export const dynamic = 'force-dynamic';

async function load() {
  try {
    const sb = supabaseAdmin();
    const { data } = await sb
      .from('agents')
      .select('*')
      .eq('type', 'customer_service')
      .order('created_at');
    const agents = (data ?? []) as Agent[];
    const views: ChannelAgentView[] = agents.map((a) => {
      const cfg = a.config as {
        company?: string;
        role_code?: string;
        line_destination?: string;
      };
      return {
        id: a.id,
        role_code: cfg.role_code ?? '',
        name: a.name,
        company: cfg.company ?? null,
        avatar: a.avatar,
        enabled: a.enabled,
        connected: Boolean(cfg.line_destination),
        destination: cfg.line_destination ?? null,
      };
    });
    return { ok: true as const, views };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export default async function ChannelsPage() {
  const data = await load();
  const h = headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'your-domain';
  const proto = h.get('x-forwarded-proto') ?? (host.includes('localhost') ? 'http' : 'https');
  const webhookUrl = `${proto}://${host}/api/line/webhook`;

  return (
    <>
      <div className="topbar">
        <div>
          <h1>LINE 頻道</h1>
          <div className="sub">把各公司官方帳號接上對應的智能客服角色（多租戶）</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
          步驟 1 · 在 LINE Developers 該 channel 的 Messaging API 分頁，把 Webhook URL 設成：
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <code style={{ fontSize: 14, wordBreak: 'break-all' }}>{webhookUrl}</code>
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          記得開啟「Use webhook」，並關閉「自動回覆訊息 / 加入好友的問候語」，避免與本系統重複回覆。
        </div>
      </div>

      <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
        步驟 2 · 在下方對應公司貼上 Channel secret 與 Channel access token，按「連線並上線」。
        金鑰只會傳到後台伺服器寫入該角色設定。
      </div>

      {!data.ok && <div className="notice">無法讀取角色：{data.error}</div>}
      {data.ok && <ChannelConnectForm agents={data.views} />}
    </>
  );
}
