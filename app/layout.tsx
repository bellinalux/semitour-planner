import type { Metadata } from "next";
import { Geist, Noto_Sans_KR } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const notoSansKr = Noto_Sans_KR({
  variable: "--font-noto-kr",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  preload: false,
});

export const metadata: Metadata = {
  title: "세미투어 플래너",
  description: "세미투어 기획 및 견적 자동화 — 일정 생성, 원가 계산, 경쟁사 비교, USP 추출",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${geistSans.variable} ${notoSansKr.variable} h-full antialiased`}>
      <body className="h-full">{children}</body>
    </html>
  );
}
