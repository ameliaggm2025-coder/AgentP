'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function BroadcastComposer({ tags }: { tags: string[] }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [audience, setAudience] = useState('all');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string>('');

  async function send() {
    if (!title.trim() || !content.trim()) {
      setResult('請填寫標題與內容');
      return;
    }
    if (!confirm(`確定要對「${audience === 'all' ? '全體好友' : audience}」發送這則推播嗎？`)) return;
    setBusy(true);
    setResult('');
    const res = await fetch('/api/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content, audience }),
    });
    const json = await res.json();
    setBusy(false);
    if (res.ok) {
      setResult(`✅ 已送出，成功推播 ${json.sent} 位好友${json.note ? '（' + json.note + '）' : ''}`);
      setTitle('');
      setContent('');
      router.refresh();
    } else {
      setResult(`❌ 發送失敗：${json.error || (json.errors && json.errors[0]) || '未知錯誤'}`);
    }
  }

  return (
    <div className="card">
      <h3>新增群發推播</h3>
      <label className="field">
        <span className="lab">活動標題（內部識別用）</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例：週年慶 8 折優惠" />
      </label>
      <label className="field">
        <span className="lab">推播內容（好友會收到的文字）</span>
        <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="輸入要發送給好友的訊息…" />
      </label>
      <label className="field">
        <span className="lab">發送對象</span>
        <select value={audience} onChange={(e) => setAudience(e.target.value)}>
          <option value="all">全體好友</option>
          {tags.map((t) => (
            <option key={t} value={t}>
              標籤：{t}
            </option>
          ))}
        </select>
      </label>
      <div className="row">
        <button onClick={send} disabled={busy}>
          {busy ? '發送中…' : '立即發送'}
        </button>
        {result && <span className="muted" style={{ fontSize: 13 }}>{result}</span>}
      </div>
    </div>
  );
}
