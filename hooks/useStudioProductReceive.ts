"use client";

/**
 * 상세페이지 스튜디오의 [세미투어로 보내기]를 받는다.
 * 그쪽이 이 화면을 ?from=tourdesign&td=<1회용 번호> 로 열면:
 *   1) 화면이 준비되면(접근 코드 통과 뒤) 연 창에 {type:'semitour:ready', nonce} 를 알리고
 *   2) {type:'studio:product', nonce, product} 를 받아 입력칸을 채운 뒤
 *   3) {type:'semitour:received', nonce, ok} 로 답한다.
 * 이 창을 연 창에서 온, 주소의 1회용 번호가 맞는 메시지만 받는다(상세페이지 스튜디오가 PC 파일로 열려도 동작).
 */
import { useEffect, useRef, useState } from "react";
import { parseStudioProduct, productToInputPatch } from "@/lib/studioProduct";
import type { TripInput } from "@/types";


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
    // 상세페이지 스튜디오는 PC 파일·여러 주소에서 열리므로 보낸 사이트 대신 1회용 번호(주소에만 있는 비밀)로 확인한다
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window.opener && window.opener) return;   // 이 창을 연 그 창에서 온 것만
      const d = e.data as { type?: string; nonce?: string; product?: unknown } | null;
      if (!d || d.type !== "studio:product" || d.nonce !== nonce) return;
      const product = parseStudioProduct(d.product);
      const reply = (ok: boolean, message?: string) => {
        try {
          (e.source as Window | null)?.postMessage({ type: "semitour:received", nonce, ok, message }, e.origin && e.origin !== "null" ? e.origin : "*");
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
    // 준비됐다고 알린다 (내용은 1회용 번호뿐이라 연 창이 어느 주소든 보낸다)
    try {
      window.opener?.postMessage({ type: "semitour:ready", nonce }, "*");
    } catch {
      /* 무시 */
    }
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return [notice, () => setNotice(null)];
}
