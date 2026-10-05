"use client";

/** 맨 바깥(레이아웃)까지 무너진 경우의 오류 화면 — 자체 html·body와 최소 스타일을 쓴다 */
import { useEffect } from "react";
import { reportError } from "@/lib/errorReport";

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    reportError("react", error, error.digest ? `global digest ${error.digest}` : "global");
  }, [error]);
  return (
    <html lang="ko">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f8fafc", display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center" }}>
        <title>세미투어 플래너 — 오류</title>
        <div style={{ maxWidth: 420, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 24, textAlign: "center" }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>화면을 불러오다 오류가 났습니다</h2>
          <p style={{ fontSize: 14, color: "#475569" }}>입력하신 내용은 이 브라우저에 저장돼 있습니다. 다시 시도하거나 새로고침해 주세요.</p>
          <button type="button" onClick={() => retry()} style={{ background: "#4f46e5", color: "#fff", border: 0, borderRadius: 8, padding: "8px 16px", fontWeight: 600, marginRight: 8, cursor: "pointer" }}>다시 시도</button>
          <button type="button" onClick={() => window.location.reload()} style={{ background: "#fff", border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 16px", cursor: "pointer" }}>새로고침</button>
        </div>
      </body>
    </html>
  );
}
