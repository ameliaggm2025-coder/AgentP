/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 專案未附 ESLint 設定，避免 Zeabur 雲端 build 卡在 lint
  eslint: { ignoreDuringBuilds: true },
};

module.exports = nextConfig;
