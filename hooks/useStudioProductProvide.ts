"use client";

/**
 * 상세페이지 스튜디오의 [세미투어에서 가져오기]에 답한다 (그쪽이 PC 파일로 열려 있어도 동작).
 * 그쪽이 이 화면을 ?from=tourdesign&pull=<1회용 번호> 로 열면 화면 위에 "이 일정을 보낼까요?"를 띄우고,
 * 사용자가 [보내기]를 누르면 연 창에 {type:'studio:product', nonce, product} 를 보낸다.
 * 그쪽 → 여기: {type:'tourdesign:received', nonce, ok} (연 창에서 온, 번호가 맞는 것만 받는다)
 * 사용자가 누를 때만 보낸다 — 일정을 고르거나(저장한 일정 불러오기) 고친 뒤 보낼 수 있게.
 */
import { useEffect, useRef, useState } from "react";
import type { StudioProduct } from "@/lib/studioProduct";

export type ProvideState =
  | { status: "idle" }
  | { status: "asked" }
  | { status: "sent" }
  | { status: "done"; ok: boolean; message?: string };

export function useStudioProductProvide(getProduct: () => StudioProduct | null): {
  state: ProvideState;
  send: () => string | null;
  dismiss: () => void;
} {
  const [state, setState] = useState<ProvideState>({ status: "idle" });
  const nonceRef = useRef("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // 주소의 번호는 처음 한 번 읽어 보관한다(효과가 다시 실행돼도 — 개발 모드의 두 번 실행 등 — 같은 번호로 듣는다)
    const n = nonceRef.current || (params.get("from") === "tourdesign" ? params.get("pull") ?? "" : "");
    if (!n || !window.opener) return;
    const first = !nonceRef.current;
    nonceRef.current = n;
    // 다시 고침해도 또 묻지 않게 주소의 번호는 지운다
    if (first) window.history.replaceState(null, "", window.location.pathname);
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window.opener) return;
      const d = e.data as { type?: string; nonce?: string; ok?: boolean; message?: string } | null;
      if (!d || d.type !== "tourdesign:received" || d.nonce !== n) return;
      setState({ status: "done", ok: !!d.ok, message: d.message });
      window.removeEventListener("message", onMessage);
    };
    window.addEventListener("message", onMessage);
    // 주소에서 번호를 읽은 뒤 한 번만 띄우는 알림이라 여기서 상태를 바꾼다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (first) setState({ status: "asked" });
    return () => window.removeEventListener("message", onMessage);
  }, []);

  /** 보내기 — 보낼 일정이 없으면 안내 문구를 돌려준다 */
  const send = (): string | null => {
    const p = getProduct();
    if (!p || !(p.days ?? []).length) return "보낼 일정이 없습니다. 일정을 만들거나 [저장한 일정]에서 불러온 뒤 다시 누르세요.";
    if (!window.opener) return "상세페이지 스튜디오 창이 닫혔습니다. 그쪽에서 다시 [세미투어에서 가져오기]를 눌러 주세요.";
    try {
      // 받는 쪽이 PC 파일(주소 "null")일 수 있어 대상 주소를 정하지 않는다 — 연 창 + 1회용 번호로 확인한다
      window.opener.postMessage({ type: "studio:product", nonce: nonceRef.current, product: p }, "*");
    } catch {
      return "보내지 못했습니다. 그쪽에서 다시 시도해 주세요.";
    }
    setState({ status: "sent" });
    return null;
  };

  return { state, send, dismiss: () => setState({ status: "idle" }) };
}
