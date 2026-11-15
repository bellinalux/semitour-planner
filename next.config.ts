import type { NextConfig } from "next";

/**
 * 다른 사이트 안(iframe)에 넣을 수 있는 곳 — 직원 화면은 막고(클릭재킹 방지),
 * 고객용 화면(코스 만들기·코스 가이드·고객 웹 일정표·견적 요청)만 스케치북트래블 쇼핑몰(카페24)에 허용한다.
 * 쇼핑몰 도메인을 바꾸면 SHOP_FRAME_ORIGINS를 고친다.
 */
const SHOP_FRAME_ORIGINS = ["https://skcbook.com", "https://*.skcbook.com", "https://*.cafe24.com", "https://*.cafe24shop.com"];

const nextConfig: NextConfig = {
  async headers() {
    return [
      // 기본: 우리 사이트 안에서만 (직원 화면 전부)
      { source: "/:path*", headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'self'" }, { key: "X-Frame-Options", value: "SAMEORIGIN" }] },
      // 고객용 공개 화면: 쇼핑몰에 넣을 수 있게 (나중 규칙이 앞 규칙을 덮는다)
      ...["/plan", "/plan/:path*", "/guide", "/guide/:path*", "/t/:path*", "/q"].map((source) => ({
        source,
        headers: [
          { key: "Content-Security-Policy", value: `frame-ancestors 'self' ${SHOP_FRAME_ORIGINS.join(" ")}` },
          // X-Frame-Options는 여러 출처를 지정할 수 없어 CSP를 따르게 비운다 (지원 브라우저는 모두 CSP frame-ancestors를 먼저 본다)
          { key: "X-Frame-Options", value: "ALLOWALL" },
        ],
      })),
    ];
  },
};

export default nextConfig;
