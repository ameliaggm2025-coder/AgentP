import { supabaseAdmin } from '@/lib/supabase';
import type { Broadcast, LineUser } from '@/lib/types';
import BroadcastComposer from '@/components/BroadcastComposer';

export const dynamic = 'force-dynamic';

const STATUS: Record<string, string> = {
  draft: '草稿', sending: '發送中', sent: '已送出', failed: '失敗',
};

async function load() {
  try {
    const sb = supabaseAdmin();
    const [bcs, users] = await Promise.all([
      sb.from('broadcasts').select('*').order('created_at', { ascending: false }).limit(30),
      sb.from('line_users').select('tags'),
    ]);
    const tagSet = new Set<string>();
    ((users.data ?? []) as Pick<LineUser, 'tags'>[]).forEach((u) =>
      (u.tags ?? []).forEach((t) => tagSet.add(t))
    );
    return { ok: true as const, broadcasts: (bcs.data ?? []) as Broadcast[], tags: [...tagSet] };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export default async function BroadcastsPage() {
  const data = await load();

  return (
    <>
      <div className="topbar">
        <div>
          <h1>群發推播</h1>
          <div className="sub">行銷活動推播助手 · 對全體或分眾好友發送</div>
        </div>
      </div>

      {!data.ok && <div className="notice">無法讀取資料：{data.error}</div>}

      {data.ok && (
        <>
          <BroadcastComposer tags={data.tags} />

          <h2 style={{ marginTop: 28 }}>發送紀錄</h2>
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>標題</th><th>對象</th><th>狀態</th><th className="right">送達人數</th><th>時間</th>
                </tr>
              </thead>
              <tbody>
                {data.broadcasts.map((b) => (
                  <tr key={b.id}>
                    <td>{b.title}</td>
                    <td>{b.audience === 'all' ? '全體' : b.audience}</td>
                    <td>
                      <span className={`badge ${b.status === 'sent' ? 'on' : b.status === 'failed' ? 'off' : 'type'}`}>
                        {STATUS[b.status] ?? b.status}
                      </span>
                    </td>
                    <td className="right">{b.sent_count}</td>
                    <td className="muted">{new Date(b.sent_at ?? b.created_at).toLocaleString('zh-TW')}</td>
                  </tr>
                ))}
                {data.broadcasts.length === 0 && (
                  <tr><td colSpan={5} className="muted">尚無發送紀錄</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
