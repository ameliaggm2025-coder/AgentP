import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Line 通知管理後台',
  description: 'Line 官方帳號通知與 AI Agent 管理後台',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
