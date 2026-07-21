'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const items = [
  { href: '/', label: '總覽', icon: '📊' },
  { href: '/agents', label: 'Agent 管理', icon: '🤖' },
  { href: '/channels', label: 'LINE 頻道', icon: '🔗' },
  { href: '/broadcasts', label: '群發推播', icon: '📢' },
  { href: '/users', label: '好友名單', icon: '👥' },
  { href: '/messages', label: '訊息紀錄', icon: '📜' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="dot">💬</span> Line 通知後台
      </div>
      <nav className="nav">
        {items.map((it) => {
          const active = it.href === '/' ? pathname === '/' : pathname.startsWith(it.href);
          return (
            <Link key={it.href} href={it.href} className={active ? 'active' : ''}>
              <span>{it.icon}</span> {it.label}
            </Link>
          );
        })}
      </nav>
      <button
        className="ghost"
        onClick={logout}
        style={{ position: 'absolute', bottom: 20, left: 14, right: 14, width: 'auto' }}
      >
        登出
      </button>
    </aside>
  );
}
