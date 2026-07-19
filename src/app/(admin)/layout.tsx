import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AUTH_COOKIE, verifySessionToken } from '@/lib/auth';
import Sidebar from '@/components/Sidebar';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const token = cookies().get(AUTH_COOKIE)?.value;
  if (!verifySessionToken(token)) {
    redirect('/login');
  }
  return (
    <div className="shell">
      <Sidebar />
      <main className="main">{children}</main>
    </div>
  );
}
