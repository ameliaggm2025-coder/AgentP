import { supabaseAdmin } from '@/lib/supabase';
import type { LineUser } from '@/lib/types';

export const dynamic = 'force-dynamic';

async function load() {
  try {
    const sb = supabaseAdmin();
    const { data } = await sb.from('line_users').select('*').order('followed_at', { ascending: false }).limit(200);
    return { ok: true as const, users: (data ?? []) as LineUser[] };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export default async function UsersPage() {
  const data = await load();
  return (
    <>
      <div className="topbar">
        <div>
          <h1>好友名單</h1>
          <div className="sub">加入官方帳號的 Line 好友（由 webhook 自動寫入）</div>
        </div>
      </div>

      {!data.ok && <div className="notice">無法讀取：{data.error}</div>}

      {data.ok && (
        <div className="card">
          <table>
            <thead>
              <tr><th>顯示名稱</th><th>標籤</th><th>狀態</th><th>加入時間</th></tr>
            </thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u.id}>
                  <td className="row" style={{ gap: 8 }}>
                    {u.picture_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={u.picture_url} alt="" width={28} height={28} style={{ borderRadius: '50%' }} />
                    ) : (
                      <span className="ava" style={{ width: 28, height: 28, fontSize: 14 }}>👤</span>
                    )}
                    {u.display_name ?? u.line_user_id.slice(0, 10) + '…'}
                  </td>
                  <td>{u.tags.length ? u.tags.map((t) => <span key={t} className="pill" style={{ marginRight: 4 }}>{t}</span>) : <span className="muted">—</span>}</td>
                  <td>
                    <span className={`badge ${u.status === 'active' ? 'on' : 'off'}`}>
                      {u.status === 'active' ? '追蹤中' : '已封鎖'}
                    </span>
                  </td>
                  <td className="muted">{new Date(u.followed_at).toLocaleString('zh-TW')}</td>
                </tr>
              ))}
              {data.users.length === 0 && (
                <tr><td colSpan={4} className="muted">尚無好友資料。當有人加入官方帳號並設定好 Webhook 後會自動出現。</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
