"use client";

import { useState } from "react";

type Lang = "ko" | "en" | "ja" | "zh";

const L: Record<Lang, { title: string; intro: string; name: string; contact: string; travelers: string; options: string; message: string; send: string; sending: string; done: string; fail: string; offline: string }> = {
  ko: {
    title: "이 일정으로 예약 요청",
    intro: "남겨 주시면 담당자가 확인 후 연락드립니다. 아직 결제·확정은 아닙니다.",
    name: "이름 *",
    contact: "연락처 (전화·카톡 ID·이메일) *",
    travelers: "인원 *",
    options: "함께 할 선택관광 (선택)",
    message: "요청 사항 (선택)",
    send: "예약 요청 보내기",
    sending: "보내는 중…",
    done: "예약 요청을 받았습니다. 곧 연락드리겠습니다!",
    fail: "보내지 못했습니다.",
    offline: "연결이 끊겼습니다. 잠시 뒤 다시 보내 주세요.",
  },
  en: {
    title: "Request to book this itinerary",
    intro: "We will contact you to confirm. This is not a payment or a confirmed booking yet.",
    name: "Name *",
    contact: "Contact (phone, messenger ID or email) *",
    travelers: "Travelers *",
    options: "Optional tours to add",
    message: "Message (optional)",
    send: "Send booking request",
    sending: "Sending…",
    done: "We received your request. We will contact you soon!",
    fail: "Could not send.",
    offline: "Connection lost. Please try again shortly.",
  },
  ja: {
    title: "この日程で予約をリクエスト",
    intro: "担当者が確認のうえご連絡します。まだお支払い・確定ではありません。",
    name: "お名前 *",
    contact: "連絡先（電話・メッセンジャーID・メール）*",
    travelers: "人数 *",
    options: "追加するオプショナルツアー（任意）",
    message: "ご要望（任意）",
    send: "予約リクエストを送る",
    sending: "送信中…",
    done: "予約リクエストを受け付けました。まもなくご連絡します！",
    fail: "送信できませんでした。",
    offline: "接続が切れました。しばらくしてからもう一度お送りください。",
  },
  zh: {
    title: "按此行程申请预订",
    intro: "工作人员确认后会与您联系。目前尚未付款或确认预订。",
    name: "姓名 *",
    contact: "联系方式（电话、社交账号或邮箱）*",
    travelers: "人数 *",
    options: "想加的自费项目（可选）",
    message: "其他要求（可选）",
    send: "发送预订申请",
    sending: "发送中…",
    done: "已收到您的预订申请，我们会尽快联系您！",
    fail: "发送失败。",
    offline: "网络中断，请稍后再试。",
  },
};

/** 고객 웹 일정표의 [이 일정으로 예약 요청] — 이름·연락처·인원·선택관광을 받아 회사의 웹 견적 요청함으로 보낸다 */
export function BookRequestForm({ id, lang, travelers, options }: { id: string; lang: Lang; travelers: number; options: { name: string; price: string; day: number }[] }) {
  const t = L[lang];
  const [f, setF] = useState({ name: "", contact: "", travelers: Math.max(1, travelers), options: [] as string[], message: "", website: "" });
  const [state, setState] = useState<{ status: "idle" | "sending" | "done" | "error"; message?: string }>({ status: "idle" });
  const field = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none";

  if (state.status === "done") return <p className="rounded-xl bg-emerald-50 px-4 py-6 text-center font-semibold text-emerald-800">{t.done}</p>;
  return (
    <section aria-label={t.title} className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
      <h2 className="font-semibold text-slate-900">{t.title}</h2>
      <p className="text-pretty text-xs text-slate-600">{t.intro}</p>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setState({ status: "sending" });
          try {
            const r = await fetch(`/api/share/${id}/request`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
            if (!r.ok) {
              const j = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
              return setState({ status: "error", message: j?.error?.message ?? t.fail });
            }
            setState({ status: "done" });
          } catch {
            setState({ status: "error", message: t.offline });
          }
        }}
      >
        <label className="block space-y-1">
          <span className="text-xs text-slate-600">{t.name}</span>
          <input required maxLength={40} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={field} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-slate-600">{t.contact}</span>
          <input required maxLength={60} value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} className={field} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-slate-600">{t.travelers}</span>
          <input type="number" required min={1} max={200} value={f.travelers} onChange={(e) => setF({ ...f, travelers: Math.max(1, Math.min(200, Math.round(Number(e.target.value) || 1))) })} className={field} />
        </label>
        {options.length > 0 && (
          <fieldset className="space-y-1">
            <legend className="text-xs text-slate-600">{t.options}</legend>
            {options.map((o) => (
              <label key={o.name} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={f.options.includes(o.name)} onChange={(e) => setF({ ...f, options: e.target.checked ? [...f.options, o.name] : f.options.filter((x) => x !== o.name) })} />
                <span className="min-w-0 flex-1">{o.name}</span>
                {o.price && <span className="shrink-0 tabular-nums text-xs text-slate-500">{o.price}</span>}
              </label>
            ))}
          </fieldset>
        )}
        <label className="block space-y-1">
          <span className="text-xs text-slate-600">{t.message}</span>
          <textarea rows={3} maxLength={500} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} className={field} />
        </label>
        {/* 사람에게는 안 보이는 칸 — 자동 입력 프로그램만 채운다 */}
        <input tabIndex={-1} autoComplete="off" aria-hidden className="hidden" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} name="website" />
        {state.status === "error" && <p className="text-sm text-red-600">{state.message}</p>}
        <button type="submit" disabled={state.status === "sending"} className="w-full rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white disabled:opacity-50">
          {state.status === "sending" ? t.sending : t.send}
        </button>
      </form>
    </section>
  );
}
