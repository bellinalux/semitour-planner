import type { MetadataRoute } from "next";

/** 휴대폰·PC에 앱처럼 설치 (홈 화면 아이콘으로 바로 열기) */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "세미투어 플래너",
    short_name: "세미투어",
    description: "세미투어·패키지 기획 및 견적 자동화",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#4f46e5",
    lang: "ko",
    icons: [
      { src: "/logo-mark.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/logo-mark.png", sizes: "192x192", type: "image/png", purpose: "any" },
    ],
  };
}
