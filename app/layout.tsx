import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "카카오 인박스",
  description: "로컬 카카오톡 인박스 관리 GUI",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "카카오 인박스",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* 라이트 테마 theme-color */}
        <meta name="theme-color" content="#D6D8DF" />
        <link rel="apple-touch-icon" href="/icon.svg" />
      </head>
      <body className="h-full overflow-hidden">{children}</body>
    </html>
  );
}
