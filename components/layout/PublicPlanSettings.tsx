"use client";

import { Globe, Loader2, X } from "lucide-react";
import { useRef, useState } from "react";
import { CopyButton } from "@/components/dashboard/CopyButton";
import { useSession } from "@/components/SessionContext";
import type { PublicPlanSettings as Settings } from "@/lib/publicPlan";
import { buttonClass, fieldClass } from "./account/shared";

interface View {
  settings: Settings;
  stats: { destinations: Record<string, number>; made: number; requested: number };
  mail: boolean;
  turnstile: boolean;
}

/** 더보기 → [고객 코스 만들기] (관리자만) — 켜기/끄기, 하루 상한, AI 사용, 경비 표시, 알림 이메일, 자사몰(카페24)에 붙일 코드, 통계 */
export function PublicPlanSettings() {
  const session = useSession();
  const ref = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState<View | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  if (!session.isAdmin) return null;

  const open = async () => {
    setMsg("");
    ref.current?.showModal();
    const r = await fetch("/api/public-plan/settings").catch(() => null);
    if (r?.ok) {
      const v = (await r.json()) as View;
      setView(v);
      setDraft(v.settings);
    } else setMsg("설정을 불러오지 못했습니다.");
  };
  const save = async () => {
    if (!draft) return;
    setBusy(true);
    const r = await fetch("/api/public-plan/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) }).catch(() => null);
    setBusy(false);
    if (r?.ok) {
      const j = (await r.json()) as { settings: Settings };
      setDraft(j.settings);
      setMsg("저장했습니다.");
    } else setMsg("저장하지 못했습니다 (서버 저장소 확인).");
  };

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const link = `${origin}/plan`;
  const iframeCode = `<iframe id="sketch-plan" src="${origin}/plan?embed=1" style="width:100%;border:0;min-height:900px" title="내 여행 코스 만들기" allow="clipboard-write"></iframe>\n<script src="${origin}/embed.js"></script>`;
  const buttonCode = `<script src="${origin}/embed.js" data-mode="button" data-label="✈ 내 여행 코스 만들기"></script>`;
  const top = Object.entries(view?.stats.destinations ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const set = (p: Partial<Settings>) => setDraft((d) => (d ? { ...d, ...p } : d));

  return (
    <>
      <button type="button" onClick={() => void open()} className={buttonClass} aria-haspopup="dialog">
        <Globe className="h-3.5 w-3.5" aria-hidden />
        <span>고객 코스 만들기</span>
      </button>
      <dialog ref={ref} aria-labelledby="pplan-title" className="m-auto w-[calc(100%-2rem)] max-w-2xl rounded-xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-900/40">
        <div className="flex max-h-[85dvh] flex-col">
          <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 id="pplan-title" className="text-sm font-semibold text-slate-900">
              고객 코스 만들기 (자사몰·홈페이지용)
            </h2>
            <button type="button" onClick={() => ref.current?.close()} aria-label="닫기" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </header>
          <div className="space-y-4 overflow-y-auto p-4 text-xs text-slate-700">
            {!draft ? (
              <p className="flex items-center gap-1.5 text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> 불러오는 중… {msg}
              </p>
            ) : (
              <>
                <section aria-label="운영" className="space-y-2">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={draft.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
                    <b>고객 코스 만들기 켜기</b>
                  </label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="space-y-0.5">
                      <span className="text-[11px] text-slate-500">회사 전체 하루 상한 (코스 만들기 횟수)</span>
                      <input type="number" min={0} max={5000} value={draft.dailyCap} onChange={(e) => set({ dailyCap: Number(e.target.value) })} className={fieldClass} aria-label="하루 상한" />
                    </label>
                    <label className="space-y-0.5">
                      <span className="text-[11px] text-slate-500">고객(IP) 한 명당 하루</span>
                      <input type="number" min={1} max={100} value={draft.ipDaily} onChange={(e) => set({ ipDaily: Number(e.target.value) })} className={fieldClass} aria-label="IP당 하루 상한" />
                    </label>
                  </div>
                  <label className="flex items-start gap-2">
                    <input type="checkbox" checked={draft.aiFallback} onChange={(e) => set({ aiFallback: e.target.checked })} className="mt-0.5" />
                    <span>
                      지식 창고에 장소가 부족한 여행지는 AI로 만들기 <span className="text-slate-500">(끄면 AI 비용 0 — 지식 창고에 쌓인 여행지만 코스가 나오고, 나머지는 견적 요청으로 안내)</span>
                    </span>
                  </label>
                  <label className="block space-y-0.5">
                    <span className="text-[11px] text-slate-500">화면 맨 위 안내 문구 (선택)</span>
                    <input value={draft.notice} onChange={(e) => set({ notice: e.target.value })} className={fieldClass} placeholder="예) 만든 코스로 견적을 요청하시면 1영업일 안에 연락드립니다" aria-label="안내 문구" />
                  </label>
                </section>

                <section aria-label="예상 경비" className="space-y-2">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={draft.showPrice} onChange={(e) => set({ showPrice: e.target.checked })} />
                    <b>예상 경비 범위 보여 주기</b>
                  </label>
                  <p className="text-[11px] text-slate-500">여행지에 아래 글자가 들어 있으면 그 안내를 보여 줍니다 (한 줄에 &quot;여행지 | 안내&quot;).</p>
                  <textarea
                    rows={4}
                    value={draft.priceTable.map((p) => `${p.match} | ${p.text}`).join("\n")}
                    onChange={(e) => set({ priceTable: e.target.value.split("\n").map((l) => l.split("|")).filter((x) => x.length >= 2).map(([m, ...t]) => ({ match: m.trim(), text: t.join("|").trim() })) })}
                    className={`${fieldClass} font-mono`}
                    placeholder={"후쿠오카 | 1인 69만~89만 원 (2박3일, 항공 포함)\n다낭 | 1인 79만~119만 원 (3박5일, 항공 포함)"}
                    aria-label="예상 경비 표"
                  />
                </section>

                <section aria-label="알림" className="space-y-1">
                  <label className="block space-y-0.5">
                    <span className="font-semibold">새 견적 요청 알림 이메일</span>
                    <input type="email" value={draft.notifyEmail} onChange={(e) => set({ notifyEmail: e.target.value })} className={fieldClass} placeholder="예) 상담 담당 이메일" aria-label="알림 이메일" />
                  </label>
                  {!view?.mail && <p className="text-[11px] text-amber-800">메일 발송 키(RESEND_API_KEY)가 아직 없어 알림이 가지 않습니다. Cloudflare 변수에 넣으면 바로 보냅니다(무료 월 3,000통).</p>}
                </section>
                {!view?.turnstile && <p className="text-[11px] text-amber-800">사람 확인(Turnstile) 키가 없습니다 — 하루 상한·분당 제한만으로 막습니다. Cloudflare에서 무료 키(TURNSTILE_SITE_KEY·TURNSTILE_SECRET_KEY)를 만들어 넣으면 자동 요청을 더 잘 막습니다.</p>}

                <div className="flex items-center gap-2">
                  <button type="button" disabled={busy} onClick={() => void save()} className="rounded-md bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-700 disabled:bg-slate-300">
                    저장
                  </button>
                  {msg && <span role="status" className="text-emerald-700">{msg}</span>}
                </div>

                <section aria-label="자사몰에 붙이기" className="space-y-2 rounded-lg bg-slate-50 p-3">
                  <b>자사몰(카페24 skcbook.com)에 붙이기</b>
                  <p className="text-[11px] text-slate-600">① 링크: 메뉴·배너에 아래 주소를 겁니다.</p>
                  <div className="flex items-center gap-1.5">
                    <code className="flex-1 truncate rounded bg-white px-2 py-1">{link}</code>
                    <CopyButton label="링크 복사" variant="secondary" disabled={false} getText={() => link} />
                  </div>
                  <p className="text-[11px] text-slate-600">② 쇼핑몰 페이지 안에 넣기: 카페24 디자인 편집에서 새 페이지를 만들고 아래 코드를 붙입니다 (PC·모바일 스킨 모두). 높이는 자동으로 맞춰집니다.</p>
                  <div className="flex items-start gap-1.5">
                    <pre className="flex-1 overflow-x-auto whitespace-pre-wrap rounded bg-white px-2 py-1 text-[10.5px]">{iframeCode}</pre>
                    <CopyButton label="코드 복사" variant="secondary" disabled={false} getText={() => iframeCode} />
                  </div>
                  <p className="text-[11px] text-slate-600">③ 모든 페이지에 떠 있는 버튼: 공통 레이아웃 맨 아래에 붙입니다.</p>
                  <div className="flex items-start gap-1.5">
                    <pre className="flex-1 overflow-x-auto whitespace-pre-wrap rounded bg-white px-2 py-1 text-[10.5px]">{buttonCode}</pre>
                    <CopyButton label="코드 복사" variant="secondary" disabled={false} getText={() => buttonCode} />
                  </div>
                  <p className="text-[11px] text-slate-500">쇼핑몰 안 표시는 skcbook.com·*.skcbook.com·카페24 미리보기 도메인에서만 허용됩니다 (다른 사이트에는 넣을 수 없음).</p>
                </section>

                <section aria-label="통계" className="space-y-1">
                  <b>고객 코스 통계</b>
                  <p>
                    만든 코스 {view?.stats.made ?? 0}건 · 견적 요청 {view?.stats.requested ?? 0}건
                  </p>
                  {top.length > 0 && <p className="text-slate-600">많이 만든 여행지: {top.map(([c, n]) => `${c} ${n}`).join(" · ")}</p>}
                </section>
              </>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
