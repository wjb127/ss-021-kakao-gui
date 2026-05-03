import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  // 폰/외부 접속 허용
  // - Tailscale: 100.x.x.x / *.ts.net
  // - LAN: 192.168.x.x
  // - Bonjour mDNS: *.local
  allowedDevOrigins: [
    "100.90.114.109",
    "*.ts.net",
    "192.168.219.101",
    "192.168.*.*",
    "seungbeenui-macbookpro.local",
    "*.local",
  ],
};

export default nextConfig;
