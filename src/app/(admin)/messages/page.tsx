import { supabaseAdmin } from '@/lib/supabase';
import type { MessageLog } from '@/lib/types';

export const dynamic = 'force-dynamic';

const TYPE: Record<string, string> = {
  push: '推播', multicast: '群發', reply: '回覆', ai_reply: 'AI 回覆', broadcast: '群發活動', receive: '收到訊息',
};

async function load() {
  try {
    const sb = supabaseAdmin();
    const { data } = await sb.from('messages').select('*').order('created_at', { ascending: false }).limit(200);
    return { ok: true as const, rows: (data ?? []) as MessageLog[] };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export default async function MessagesPage() {
  const data = await load();
  return (
    <>
      <div className="topbar">
        <div>
          <h1>訊息紀錄</h1>
          <div className="sub">所有進出站訊息</div>
        </div>
      </div>

      {!data.ok && <div className="notice">無法讀取：{data.error}</div>}

      {data.ok && (
        <div className="card">
          <table>
            <thead>
              <tr><th>方向</th><th>類型</th><th>內容</th><th>狀態</th><th>時間</th></tr>
            </thead>
            <tbody>
              {data.rows.map((m) => (
                <tr key={m.id}>
                  <td>
                    <span className="pill">{m.direction === 'inbound' ? '⬇ 收到' : '⬆ 送出'}</span>
                  </td>
                  <td>{TYPE[m.message_type ?? ''] ?? m.message_type ?? '—'}</td>
                  <td style={{ maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.content ?? '—'}
                  </td>
                  <td>
                    <span className={`badge ${m.status === 'failed' ? 'off' : 'on'}`}>{m.status}</span>
                  </td>
                  <td className="muted">{new Date(m.created_at).toLocaleString('zh-TW')}</td>
                </tr>
              ))}
              {data.rows.length === 0 && (
                <tr><td colSpan={5} className="muted">尚無訊息紀錄</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
