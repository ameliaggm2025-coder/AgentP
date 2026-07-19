import { supabaseAdmin } from '@/lib/supabase';
import type { Agent, AutoReply } from '@/lib/types';
import AgentToggle from '@/components/AgentToggle';

export const dynamic = 'force-dynamic';

const TYPE_LABEL: Record<string, string> = {
  transactional: '交易通知',
  customer_service: '智能客服',
  marketing: '行銷推播',
};

async function load() {
  try {
    const sb = supabaseAdmin();
    const [agents, replies] = await Promise.all([
      sb.from('agents').select('*').order('created_at'),
      sb.from('auto_replies').select('*').order('priority', { ascending: false }),
    ]);
    return {
      ok: true as const,
      agents: (agents.data ?? []) as Agent[],
      replies: (replies.data ?? []) as AutoReply[],
    };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export default async function AgentsPage() {
  const data = await load();

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Agent 管理</h1>
          <div className="sub">3 個預設通知情境角色</div>
        </div>
      </div>

      {!data.ok && <div className="notice">無法讀取 Agent：{data.error}</div>}

      {data.ok &&
        data.agents.map((a) => {
          const myReplies = data.replies.filter((r) => r.agent_id === a.id);
          return (
            <div className="card" key={a.id} style={{ marginBottom: 16 }}>
              <div className="agent-card">
                <div className="ava">{a.avatar ?? '🤖'}</div>
                <div style={{ flex: 1 }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <div className="row">
                      <span className="name" style={{ fontSize: 16 }}>{a.name}</span>
                      <span className="badge type">{TYPE_LABEL[a.type] ?? a.type}</span>
                      <span className={`badge ${a.enabled ? 'on' : 'off'}`}>
                        {a.enabled ? '啟用' : '停用'}
                      </span>
                    </div>
                    <AgentToggle id={a.id} enabled={a.enabled} />
                  </div>
                  <div className="desc">{a.description}</div>

                  {a.type === 'customer_service' && (
                    <div className="mt">
                      <div className="notice" style={{ marginBottom: 12 }}>
                        🤖 AI 回覆已啟用（OpenAI）：關鍵字規則優先，未命中時由 OpenAI 依語意自動生成回覆。
                      </div>
                      <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>自動回覆規則</div>
                      <table>
                        <thead>
                          <tr><th>關鍵字</th><th>回覆內容</th><th className="right">優先</th></tr>
                        </thead>
                        <tbody>
                          {myReplies.map((r) => (
                            <tr key={r.id}>
                              <td><span className="pill">{r.keyword}</span></td>
                              <td>{r.reply_text}</td>
                              <td className="right">{r.priority}</td>
                            </tr>
                          ))}
                          {myReplies.length === 0 && (
                            <tr><td colSpan={3} className="muted">尚無規則</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {a.type === 'transactional' && (
                    <div className="mt notice">
                      由外部系統呼叫 <code>POST /api/notify</code> 觸發（帶 event、userId、變數）。
                      詳見 README 的 API 範例。
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
    </>
  );
}
