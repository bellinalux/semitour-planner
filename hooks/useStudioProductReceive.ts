"use client";

/**
 * 상세페이지 스튜디오의 [세미투어로 보내기]를 받는다.
 * 그쪽이 이 화면을 ?from=tourdesign&td=<1회용 번호> 로 열면:
 *   1) 화면이 준비되면(접근 코드 통과 뒤) 연 창에 {type:'semitour:ready', nonce} 를 알리고
 *   2) {type:'studio:product', nonce, product} 를 받아 입력칸을 채운 뒤
 *   3) {type:'semitour:received', nonce, ok} 로 답한다.
 * 허용한 사이트(기본 + 상단 [스튜디오] 메뉴에 저장한 상세페이지 스튜디오 주소)에서 온 메시지만 받는다.
 */
import { useEffect, useRef, useState } from "react";
import { parseStudioProduct, productToInputPatch } from "@/lib/studioProduct";
import type { TripInput } from "@/types";

const DEFAULT_ORIGINS = ["https://bellinalux.github.io", "http://localhost:3010", "http://127.0.0.1:3010"];

function allowedOrigins(): string[] {
  const list = [...DEFAULT_ORIGINS];
  try {
    const saved = localStorage.getItem("studio_url_tourdesign");
    if (saved) list.push(new URL(saved).origin);
  } catch {
    /* 저장된 주소가 없거나 잘못됨 */
  }
  return list;
}

export interface StudioReceiveNotice {
  title: string;
  courses: number;
}

export function useStudioProductReceive(
  input: TripInput,
  update: (patch: Partial<TripInput>) => void,
  onReceived: () => void,
): [StudioReceiveNotice | null, () => void] {
  const [notice, setNotice] = useState<StudioReceiveNotice | null>(null);
  // 메시지 처리기에서 최신 값을 쓰려고 ref로 둔다(처리기는 한 번만 붙인다)
  const latest = useRef({ input, update, onReceived });
  useEffect(() => {
    latest.current = { input, update, onReceived };
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nonce = params.get("td");
    if (params.get("from") !== "tourdesign" || !nonce) return;   // 허용한 사이트 + 이 1회용 번호가 맞는 메시지만 받는다
    const origins = allowedOrigins();

    const onMessage = (e: MessageEvent) => {
      if (!origins.includes(e.origin)) return;
      const d = e.data as { type?: string; nonce?: string; product?: unknown } | null;
      if (!d || d.type !== "studio:product" || d.nonce !== nonce) return;
      const product = parseStudioProduct(d.product);
      const reply = (ok: boolean, message?: string) => {
        try {
          (e.source as Window | null)?.postMessage({ type: "semitour:received", nonce, ok, message }, e.origin);
        } catch {
          /* 보낸 창이 닫힘 */
        }
      };
      if (!product) return reply(false, "상품 데이터 형식이 올바르지 않습니다.");
      const { input: cur, update: up, onReceived: done } = latest.current;
      up(productToInputPatch(product, cur));
      setNotice({ title: product.title ?? "상품", courses: (product.days ?? []).reduce((n, day) => n + day.courses.length, 0) });
      done();
      reply(true);
      // 다시 고침해도 또 받지 않게 주소의 1회용 번호를 지운다
      window.history.replaceState(null, "", window.location.pathname);
      window.removeEventListener("message", onMessage);
    };
    window.addEventListener("message", onMessage);
    // 준비됐다고 알린다 (허용한 사이트에만 — 다른 사이트면 브라우저가 전달하지 않는다)
    origins.forEach((o) => {
      try {
        window.opener?.postMessage({ type: "semitour:ready", nonce }, o);
      } catch {
        /* 무시 */
      }
    });
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return [notice, () => setNotice(null)];
}
