import { supabaseAdmin } from '@/lib/supabase';
import type { Agent } from '@/lib/types';

export const dynamic = 'force-dynamic';

async function loadData() {
  try {
    const sb = supabaseAdmin();
    const [agents, users, msgs, sent] = await Promise.all([
      sb.from('agents').select('*').order('created_at'),
      sb.from('line_users').select('id', { count: 'exact', head: true }),
      sb.from('messages').select('id', { count: 'exact', head: true }),
      sb.from('messages').select('id', { count: 'exact', head: true }).eq('direction', 'outbound'),
    ]);
    return {
      ok: true as const,
      agents: (agents.data ?? []) as Agent[],
      userCount: users.count ?? 0,
      msgCount: msgs.count ?? 0,
      sentCount: sent.count ?? 0,
    };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export default async function Dashboard() {
  const data = await loadData();

  return (
    <>
      <div className="topbar">
        <div>
          <h1>總覽</h1>
          <div className="sub">Line 官方帳號通知與 Agent 狀態一覽</div>
        </div>
      </div>

      {!data.ok && (
        <div className="notice">
          尚未連上 Supabase：{data.error}
          <br />
          請確認 <code>.env.local</code> 內的 <code>NEXT_PUBLIC_SUPABASE_URL</code> 與{' '}
          <code>SUPABASE_SERVICE_ROLE_KEY</code>，並已在 Supabase SQL Editor 執行{' '}
          <code>supabase/schema.sql</code>。
        </div>
      )}

      {data.ok && (
        <>
          <div className="grid cols-4">
            <div className="card stat">
              <div className="label">啟用中 Agent</div>
              <div className="value">{data.agents.filter((a) => a.enabled).length}</div>
            </div>
            <div className="card stat">
              <div className="label">Line 好友</div>
              <div className="value">{data.userCount}</div>
            </div>
            <div className="card stat">
              <div className="label">已送出訊息</div>
              <div className="value">{data.sentCount}</div>
            </div>
            <div className="card stat">
              <div className="label">訊息總筆數</div>
              <div className="value">{data.msgCount}</div>
            </div>
          </div>

          <h2 style={{ marginTop: 28 }}>Agent</h2>
          <div className="grid cols-3">
            {data.agents.map((a) => (
              <div className="card agent-card" key={a.id}>
                <div className="ava">{a.avatar ?? '🤖'}</div>
                <div style={{ flex: 1 }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="name">{a.name}</span>
                    <span className={`badge ${a.enabled ? 'on' : 'off'}`}>
                      {a.enabled ? '啟用' : '停用'}
                    </span>
                  </div>
                  <div className="desc">{a.description}</div>
                </div>
              </div>
            ))}
            {data.agents.length === 0 && (
              <div className="muted">尚無 Agent，請先執行 schema.sql 匯入預設資料。</div>
            )}
          </div>
        </>
      )}
    </>
  );
}
