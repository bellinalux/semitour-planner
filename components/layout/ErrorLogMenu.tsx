"use client";

/**
 * 상단 [오류 기록] — 세미투어·상세페이지 스튜디오 화면에서 난 오류와 AI 되풀이 사건(/api/errors)을 본다.
 * 같은 오류는 한 줄로 묶여 횟수로 보인다. 누르면 자세한 위치(stack)를 펼친다.
 */
import { Bug, Loader2, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface Row { id: string; app: string; kind: string; message: string; count: number; last: string; version: string }
interface Detail extends Row { stack: string; where: string; ua: string; first: string }

const APP = { semitour: "세미투어", tourdesign: "상세페이지" } as Record<string, string>;
const KIND = { error: "오류", rejection: "오류", react: "화면", ai: "AI 되풀이", server: "서버" } as Record<string, string>;

function ago(iso: string): string {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  if (m < 60 * 24) return `${Math.round(m / 60)}시간 전`;
  return `${Math.round(m / 1440)}일 전`;
}

export function ErrorLogMenu() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const outside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, []);

  const load = async () => {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/errors");
      const j = (await r.json()) as { errors?: Row[]; error?: { message?: string } };
      if (!r.ok) throw new Error(j.error?.message ?? `오류 ${r.status}`);
      setRows(j.errors ?? []);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "불러오지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };
  const show = async (id: string) => {
    if (detail?.id === id) return setDetail(null);
    const r = await fetch(`/api/errors?id=${encodeURIComponent(id)}`);
    if (r.ok) setDetail((await r.json()) as Detail);
  };
  const clear = async () => {
    if (!window.confirm("오류 기록을 모두 지울까요?")) return;
    await fetch("/api/errors", { method: "DELETE" });
    setDetail(null);
    void load();
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { const next = !open; setOpen(next); if (next) void load(); }}
        aria-haspopup="true"
        aria-expanded={open}
        title="세미투어·상세페이지 스튜디오에서 난 오류 기록"
        className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      >
        <Bug className="h-4 w-4" aria-hidden />
        <span className="hidden sm:inline">오류 기록</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-[26rem] max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-2 shadow-lg" role="dialog" aria-label="오류 기록">
          <div className="flex items-center justify-between px-1.5 pb-1.5">
            <span className="text-[11px] font-semibold text-slate-400">최근 30일 오류 (같은 오류는 묶어서 횟수로)</span>
            {!!rows?.length && (
              <button type="button" onClick={clear} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-slate-500 hover:bg-slate-100">
                <Trash2 className="h-3 w-3" aria-hidden /> 모두 지우기
              </button>
            )}
          </div>
          {busy && <p className="flex items-center gap-1.5 px-2 py-3 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />불러오는 중…</p>}
          {msg && <p className="px-2 py-2 text-xs text-rose-600">{msg}</p>}
          {!busy && rows && !rows.length && <p className="px-2 py-3 text-xs text-slate-500">기록된 오류가 없습니다. 👍</p>}
          <ul className="max-h-[60vh] overflow-y-auto">
            {rows?.map((r) => (
              <li key={r.id} className="border-t border-slate-100 first:border-t-0">
                <button type="button" onClick={() => void show(r.id)} className="w-full px-2 py-2 text-left hover:bg-slate-50">
                  <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
                    <span className={`rounded px-1.5 py-px font-semibold ${r.app === "tourdesign" ? "bg-violet-100 text-violet-700" : "bg-indigo-100 text-indigo-700"}`}>{APP[r.app] ?? r.app}</span>
                    <span className={r.kind === "ai" ? "text-amber-600" : ""}>{KIND[r.kind] ?? r.kind}</span>
                    <span className="ml-auto">{r.count > 1 ? `${r.count}회 · ` : ""}{ago(r.last)}{r.version ? ` · ${r.version}` : ""}</span>
                  </span>
                  <span className="mt-0.5 block break-words text-xs text-slate-800">{r.message}</span>
                </button>
                {detail?.id === r.id && (
                  <pre className="mx-2 mb-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-50 p-2 text-[10.5px] leading-4 text-slate-600">
                    {[detail.where && `위치: ${detail.where}`, `처음: ${new Date(detail.first).toLocaleString("ko-KR")}`, detail.ua && `브라우저: ${detail.ua}`, detail.stack].filter(Boolean).join("\n")}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
