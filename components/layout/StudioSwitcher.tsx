"use client";

// [신규 — 사용자 요청: "쇼츠스튜디오·세미투어 스튜디오 쪽에도 같은 바로가기 메뉴 추가"]
// 상단 로고 옆 [스튜디오] — 우리가 만든 다른 웹(상세페이지 스튜디오·쇼츠스튜디오)으로 새 탭에서 이동한다.
// 각 웹 주소는 처음 한 번 [주소 설정]에 넣으면 이 브라우저에 기억한다(상세페이지 스튜디오의 같은 메뉴와 같은 방식).

import { ExternalLink, LayoutGrid, Settings2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Studio = { id: string; name: string; desc: string; key?: string; current?: boolean };

const STUDIOS: Studio[] = [
  { id: "tourdesign", name: "상세페이지 스튜디오", desc: "투어 상세페이지 만들기", key: "studio_url_tourdesign" },
  { id: "shorts", name: "쇼츠스튜디오", desc: "숏폼 영상 자동 생성", key: "studio_url_shorts" },
  { id: "semitour", name: "세미투어 스튜디오", desc: "지금 보고 있는 곳", current: true },
];

function lsGet(k: string): string {
  try {
    return localStorage.getItem(k) || "";
  } catch {
    return "";
  }
}
function lsSet(k: string, v: string) {
  try {
    if (v) localStorage.setItem(k, v);
    else localStorage.removeItem(k);
  } catch {
    /* 저장이 막힌 브라우저 */
  }
}
/** 빈 값은 "", 잘못된 주소는 null */
function normUrl(u: string): string | null {
  let s = String(u || "").trim().replace(/\/+$/, "");
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const x = new URL(s);
    return x.origin + (x.pathname === "/" ? "" : x.pathname.replace(/\/+$/, ""));
  } catch {
    return null;
  }
}

export function StudioSwitcher() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");
  const [pendingId, setPendingId] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function outside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setEditing(false);
      }
    }
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, []);

  const linkable = STUDIOS.filter((s) => s.key);

  function startEdit(focusId: string) {
    setUrls(Object.fromEntries(linkable.map((s) => [s.id, lsGet(s.key!)])));
    setErr("");
    setPendingId(focusId);
    setEditing(true);
  }
  function go(s: Studio) {
    if (s.current || !s.key) return;
    const u = normUrl(lsGet(s.key));
    if (!u) {
      startEdit(s.id);
      setErr(`${s.name} 주소를 먼저 넣어 주세요.`);
      return;
    }
    window.open(u, "_blank", "noopener");
    setOpen(false);
  }
  function save() {
    const next: Record<string, string> = {};
    for (const s of linkable) {
      const v = normUrl(urls[s.id] || "");
      if (v === null) {
        setErr(`${s.name} 주소를 확인해 주세요 (https://로 시작).`);
        return;
      }
      next[s.id] = v;
    }
    linkable.forEach((s) => lsSet(s.key!, next[s.id]));
    setEditing(false);
    setErr("");
    if (pendingId && next[pendingId]) {
      window.open(next[pendingId], "_blank", "noopener");
      setOpen(false);
    }
  }

  return (
    <div ref={ref} className="relative" data-testid="studio-switcher">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setEditing(false);
        }}
        aria-haspopup="true"
        aria-expanded={open}
        title="우리가 만든 다른 스튜디오로 이동"
        className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      >
        <LayoutGrid className="h-4 w-4" aria-hidden />
        <span className="hidden sm:inline">스튜디오</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg" role="menu">
          <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold text-slate-400">스튜디오 바로가기</div>
          {!editing && (
            <>
              {STUDIOS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  disabled={s.current}
                  onClick={() => go(s)}
                  className="flex w-full items-start justify-between gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-slate-50 disabled:cursor-default disabled:opacity-55 disabled:hover:bg-transparent"
                >
                  <span className="leading-tight">
                    <span className="block text-sm font-semibold text-slate-900">{s.name}</span>
                    <span className="block text-xs text-slate-500">{s.desc}</span>
                  </span>
                  {!s.current && <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />}
                </button>
              ))}
              <div className="my-1 border-t border-slate-100" />
              <button
                type="button"
                onClick={() => startEdit("")}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                <Settings2 className="h-4 w-4 text-slate-400" aria-hidden />
                주소 설정
              </button>
            </>
          )}
          {editing && (
            <div className="grid gap-2.5 px-2.5 pb-2 pt-1">
              {linkable.map((s) => (
                <label key={s.id} className="grid gap-1 text-xs text-slate-600">
                  <span>
                    <b className="text-slate-900">{s.name}</b> 주소
                  </span>
                  <input
                    autoFocus={pendingId === s.id}
                    value={urls[s.id] || ""}
                    placeholder="https://"
                    onChange={(e) => setUrls((u) => ({ ...u, [s.id]: e.target.value }))}
                    className="h-8 rounded-lg border border-slate-200 px-2 text-sm text-slate-900 outline-none focus:border-indigo-400"
                  />
                </label>
              ))}
              {err && <p className="text-xs text-rose-600">{err}</p>}
              <div className="flex justify-end gap-1.5">
                <button type="button" onClick={() => setEditing(false)} className="h-8 rounded-lg px-3 text-xs text-slate-600 hover:bg-slate-100">
                  취소
                </button>
                <button type="button" onClick={save} className="h-8 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white hover:bg-indigo-700">
                  저장
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
