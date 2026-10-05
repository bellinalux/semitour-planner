"use client";

/**
 * [상세페이지로] — 지금 일정을 상세페이지 스튜디오로 보낸다 (studio-product v1).
 *  - 상세페이지 스튜디오 주소(https)를 [스튜디오 → 주소 설정]에 넣어 두었으면: 그 창을 열고 준비 신호를 받은 뒤 넘긴다
 *      열기: {주소}?from=semitour&st=<1회용 번호>
 *      그쪽 → 여기: {type:'tourdesign:ready', nonce} / 여기 → 그쪽: {type:'studio:product', nonce, product}
 *      그쪽 → 여기: {type:'tourdesign:received', nonce, ok}
 *  - PC 파일로 여는 상세페이지 스튜디오는 웹에서 열 수 없으므로(브라우저가 막음) 그쪽의 [세미투어에서 가져오기]를 안내하고,
 *    상품 데이터 파일(.json)도 받을 수 있게 한다.
 */
import { FileDown, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { StudioProduct } from "@/lib/studioProduct";

const LS_KEY = "studio_url_tourdesign";

function lsGet(k: string): string {
  try {
    return localStorage.getItem(k) || "";
  } catch {
    return "";
  }
}
function nonce(): string {
  const a = new Uint8Array(18);
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
/** 상세페이지 스튜디오 웹 주소(https). PC 파일 주소·빈 값이면 null */
function webUrl(): URL | null {
  let s = lsGet(LS_KEY).trim();
  if (!s) return null;
  if (!/^[a-z]+:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    return /^https?:$/.test(u.protocol) ? u : null;
  } catch {
    return null;
  }
}

export function SendToTourdesign({ getProduct }: { getProduct: () => StudioProduct | null }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: "info" | "ok" | "err" } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const cleanup = useRef<() => void>(() => {});

  useEffect(() => {
    const outside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", outside);
    return () => {
      document.removeEventListener("mousedown", outside);
      cleanup.current();
    };
  }, []);

  const product = () => {
    const p = getProduct();
    if (!p || !(p.days ?? []).length) {
      setMsg({ text: "보낼 일정이 없습니다. 먼저 일정을 만들거나 저장한 일정을 불러오세요.", tone: "err" });
      return null;
    }
    return p;
  };

  const send = () => {
    const p = product();
    if (!p) return;
    const base = webUrl();
    if (!base) {
      setMsg({ text: "상세페이지 스튜디오 웹 주소가 없습니다. PC 파일로 쓰고 있다면 그쪽 [파일] 메뉴의 ‘세미투어에서 가져오기’를 누르세요(이 창의 지금 일정을 가져갑니다).", tone: "info" });
      return;
    }
    const n = nonce();
    const target = new URL(base);
    target.searchParams.set("from", "semitour");
    target.searchParams.set("st", n);
    const w = window.open(target.toString(), "_blank");
    if (!w) {
      setMsg({ text: "새 창이 막혔습니다. 주소창 오른쪽의 팝업 허용을 눌러 주세요.", tone: "err" });
      return;
    }
    setMsg({ text: "상세페이지 스튜디오를 여는 중… 열리면 상세페이지가 채워집니다.", tone: "info" });
    cleanup.current();
    let sent = false;
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { type?: string; nonce?: string; ok?: boolean; message?: string } | null;
      if (e.source !== w || !d || d.nonce !== n) return;   // 우리가 연 그 창 + 1회용 번호
      if (d.type === "tourdesign:ready" && !sent) {
        sent = true;
        w.postMessage({ type: "studio:product", nonce: n, product: p }, e.origin && e.origin !== "null" ? e.origin : "*");
      }
      if (d.type === "tourdesign:received") {
        stop();
        setMsg(d.ok ? { text: "✅ 상세페이지 스튜디오로 보냈습니다. 그 창에서 확인하세요.", tone: "ok" } : { text: `상세페이지 스튜디오가 받지 못했습니다: ${d.message ?? ""}`, tone: "err" });
      }
    };
    const timer = window.setTimeout(() => {
      stop();
      if (!sent) setMsg({ text: "상세페이지 스튜디오가 응답하지 않습니다. 최신 버전인지 확인하거나, 그쪽의 ‘세미투어에서 가져오기’를 써 주세요.", tone: "err" });
    }, 120000);
    const stop = () => {
      window.removeEventListener("message", onMsg);
      window.clearTimeout(timer);
    };
    cleanup.current = stop;
    window.addEventListener("message", onMsg);
  };

  const download = () => {
    const p = product();
    if (!p) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(p, null, 2)], { type: "application/json" }));
    a.download = `${(p.title || "semitour").replace(/[\\/:*?"<>|]+/g, "_")}_상품데이터.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 20000);
    setMsg({ text: "파일을 받았습니다. 상세페이지 스튜디오 [파일] 메뉴의 ‘상품 데이터 불러오기’로 여세요.", tone: "ok" });
  };

  const tone = { info: "text-slate-600", ok: "text-emerald-700", err: "text-rose-600" };
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); setMsg(null); }}
        aria-haspopup="true"
        aria-expanded={open}
        title="지금 일정으로 상세페이지 스튜디오에서 판매용 상세페이지를 만듭니다"
        className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      >
        <Send className="h-4 w-4" aria-hidden />
        <span className="hidden sm:inline">상세페이지로</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg" role="menu">
          <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold text-slate-400">상세페이지 스튜디오로 보내기</div>
          <button type="button" onClick={send} className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-slate-50">
            <Send className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden />
            <span className="leading-tight">
              <span className="block text-sm font-semibold text-slate-900">바로 보내기</span>
              <span className="block text-xs text-slate-500">상세페이지 스튜디오를 열고 제목·코스·시각을 채웁니다 (웹 주소일 때)</span>
            </span>
          </button>
          <button type="button" onClick={download} className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-slate-50">
            <FileDown className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
            <span className="leading-tight">
              <span className="block text-sm font-semibold text-slate-900">상품 데이터 파일 받기 (.json)</span>
              <span className="block text-xs text-slate-500">상세페이지 스튜디오 [파일 → 상품 데이터 불러오기]로 엽니다</span>
            </span>
          </button>
          <p className="px-2.5 pb-1.5 pt-1 text-[11px] leading-4 text-slate-500">
            상세페이지 스튜디오를 PC 파일로 쓰면 그쪽 <b>[파일] → 세미투어에서 가져오기</b>를 누르세요. 원가·판매가는 보내지 않습니다.
          </p>
          {msg && <p className={`px-2.5 pb-2 text-xs ${tone[msg.tone]}`} role="status">{msg.text}</p>}
        </div>
      )}
    </div>
  );
}
