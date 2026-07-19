'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AgentToggle({ id, enabled }: { id: string; enabled: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const next = !on;
    const res = await fetch('/api/agents', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, enabled: next }),
    });
    setBusy(false);
    if (res.ok) {
      setOn(next);
      router.refresh();
    }
  }

  return (
    <button className="ghost" onClick={toggle} disabled={busy} style={{ padding: '6px 12px', fontSize: 13 }}>
      {busy ? '…' : on ? '停用' : '啟用'}
    </button>
  );
}
