'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface ChannelAgentView {
  id: string;
  role_code: string;
  name: string;
  company: string | null;
  avatar: string | null;
  enabled: boolean;
  connected: boolean;
  destination: string | null;
}

function maskTail(s: string | null) {
  if (!s) return '';
  return s.length <= 8 ? s : `…${s.slice(-6)}`;
}

function ConnectCard({ agent }: { agent: ChannelAgentView }) {
  const router = useRouter();
  const [secret, setSecret] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function connect() {
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/channels/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role_code: agent.role_code,
        channel_secret: secret,
        channel_access_token: token,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setSecret('');
      setToken('');
      setMsg({ kind: 'ok', text: `已連線並上線 ✓　destination：${maskTail(data.destination)}` });
      router.refresh();
    } else {
      setMsg({ kind: 'err', text: data.error ?? '連線失敗' });
    }
  }

  async function disconnect() {
    if (!confirm(`確定要解除「${agent.name}」的 LINE 連線並停用嗎？`)) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/channels/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role_code: agent.role_code, action: 'disconnect' }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setMsg({ kind: 'ok', text: '已解除連線並停用' });
      router.refresh();
    } else {
      setMsg({ kind: 'err', text: data.error ?? '解除失敗' });
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <div className="row">
          <span className="ava" style={{ fontSize: 22 }}>{agent.avatar ?? '🤖'}</span>
          <div>
            <div className="row" style={{ gap: 8 }}>
              <span className="name" style={{ fontSize: 16 }}>{agent.name}</span>
              <span className="pill">{agent.role_code}</span>
            </div>
            <div className="muted" style={{ fontSize: 13 }}>{agent.company ?? ''}</div>
          </div>
        </div>
        <span className={`badge ${agent.connected && agent.enabled ? 'on' : 'off'}`}>
          {agent.connected && agent.enabled ? '已連線 · 上線中' : agent.connected ? '已連線 · 停用' : '未連線'}
        </span>
      </div>

      {agent.connected ? (
        <div>
          <div className="notice" style={{ marginBottom: 12 }}>
            已綁定 destination：<code>{maskTail(agent.destination)}</code>。要換金鑰請先解除連線再重綁。
          </div>
          <button className="ghost" onClick={disconnect} disabled={busy}>
            {busy ? '…' : '解除連線'}
          </button>
        </div>
      ) : (
        <div>
          <label className="field">
            <span className="lab">Channel secret</span>
            <input
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="從 LINE Developers 該 channel 複製"
              autoComplete="off"
            />
          </label>
          <label className="field">
            <span className="lab">Channel access token（long-lived）</span>
            <textarea
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="在 Messaging API 分頁 Issue 後貼上"
              rows={3}
              autoComplete="off"
            />
          </label>
          <button onClick={connect} disabled={busy || !secret.trim() || !token.trim()}>
            {busy ? '連線中…' : '連線並上線'}
          </button>
        </div>
      )}

      {msg && (
        <div
          className="notice"
          style={{
            marginTop: 12,
            background: msg.kind === 'ok' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
            borderColor: msg.kind === 'ok' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)',
            color: msg.kind === 'ok' ? '#7ee0a0' : '#f2a1a1',
          }}
        >
          {msg.text}
        </div>
      )}
    </div>
  );
}

export default function ChannelConnectForm({ agents }: { agents: ChannelAgentView[] }) {
  if (agents.length === 0) {
    return (
      <div className="notice">
        後台目前沒有 <code>customer_service</code> 角色。請先在 Supabase 執行{' '}
        <code>supabase/company_roles.sql</code> 建立森合／生寶／康亮角色。
      </div>
    );
  }
  return (
    <>
      {agents.map((a) => (
        <ConnectCard key={a.id} agent={a} />
      ))}
    </>
  );
}
