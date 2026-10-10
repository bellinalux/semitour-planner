"use client";

import { AlertTriangle, CalendarCheck, Cloud, HardDrive, Plus, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";
import { useBookings, type BookingView } from "@/hooks/useBookings";
import { BOOKING_STATUSES, bookingAlerts, bookingSummary, newBookingId, STATUS_LABEL, type Booking, type BookingStatus } from "@/lib/bookings";
import { formatMoney } from "@/lib/currency";
import { ReviewLinkBox } from "./ReviewLinkBox";

type Draft = Omit<Booking, "id" | "createdAt" | "updatedAt" | "owner" | "ownerId" | "history">;

interface Props {
  /** 지금 견적으로 만든 예약 초안 (견적이 없으면 null) */
  draftFromQuote: () => Draft | null;
  author: string;
  /** 고객 후기 화면에 보일 회사 이름 */
  companyName?: string;
  buttonClassName?: string;
}

const fieldClass =
  "w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30";
const STATUS_TONE: Record<BookingStatus, string> = {
  inquiry: "bg-slate-100 text-slate-600",
  quoted: "bg-sky-50 text-sky-700",
  contracted: "bg-indigo-50 text-indigo-700",
  deposit: "bg-violet-50 text-violet-700",
  paid: "bg-emerald-50 text-emerald-700",
  departed: "bg-slate-200 text-slate-700",
  cancelled: "bg-rose-50 text-rose-600",
};
type Filter = "active" | "all" | BookingStatus;

const blank = (): Draft => ({
  customerName: "",
  phone: "",
  email: "",
  destination: "",
  departureDate: "",
  days: 0,
  nights: 0,
  travelers: 1,
  currency: "KRW",
  totalPrice: 0,
  depositAmount: 0,
  paidAmount: 0,
  depositDue: "",
  balanceDue: "",
  status: "inquiry",
  planName: "",
  memo: "",
});

/** 이력 시각을 이 PC 시간대로 (예: 10.6 16:46) */
function localTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`grid gap-1 ${wide ? "sm:col-span-2" : ""}`}>
      <span className="text-[11px] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

/** 상단 [예약 관리] — 견적 이후 예약 진행 상태·입금 기한·미수금을 관리한다 */
export function BookingsMenu({ draftFromQuote, author, companyName = "", buttonClassName }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const bookings = useBookings(author);
  const [filter, setFilter] = useState<Filter>("active");
  const [editing, setEditing] = useState<(Draft & { id?: string; history?: Booking["history"]; canDelete?: boolean }) | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const open = () => {
    setMessage(null);
    setEditing(null);
    void bookings.refresh();
    dialogRef.current?.showModal();
  };

  const list = bookings.list ?? [];
  const { counts, receivable } = bookingSummary(list);
  const shown = list
    .filter((b) => (filter === "all" ? true : filter === "active" ? b.status !== "cancelled" && b.status !== "departed" : b.status === filter))
    .sort((a, b) => (a.departureDate || "9999").localeCompare(b.departureDate || "9999"));
  const alertCount = list.reduce((n, b) => n + (bookingAlerts(b).some((a) => a.level === "danger") ? 1 : 0), 0);
  const followUps = list.filter((b) => bookingAlerts(b).some((a) => a.text.includes("고객 연락") || a.text.includes("다시 견적"))).length;
  /** "연락했어요" — 메모에 연락 기록을 남기고 저장(마지막 수정일이 오늘로) */
  const markContacted = async (b: Booking) => {
    const stamp = new Date().toISOString().slice(0, 10);
    const error = await bookings.save({ ...b, memo: `${b.memo ? `${b.memo}\n` : ""}${stamp} 고객 연락`.slice(0, 2000) });
    setMessage(error ? { kind: "error", text: error } : { kind: "ok", text: `${b.customerName} — 연락 기록을 남겼습니다.` });
  };

  const startNew = (fromQuote: boolean) => {
    setConfirmDelete(false);
    setMessage(null);
    const draft = fromQuote ? draftFromQuote() : null;
    if (fromQuote && !draft) {
      setMessage({ kind: "error", text: "견적이 아직 없습니다. 코스를 만든 뒤 다시 눌러 주세요." });
      return;
    }
    setEditing(draft ?? blank());
  };

  const edit = (b: BookingView) => {
    setConfirmDelete(false);
    setMessage(null);
    setEditing({ ...b });
  };

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setEditing((prev) => (prev ? { ...prev, [key]: value } : prev));
  const numberInput = (key: "travelers" | "totalPrice" | "depositAmount" | "paidAmount") => (
    <input type="number" min={0} value={editing?.[key] ?? 0} onChange={(e) => set(key, Math.max(0, Number(e.target.value) || 0))} className={`${fieldClass} tabular-nums`} />
  );

  const save = async () => {
    if (!editing) return;
    if (!editing.customerName.trim()) {
      setMessage({ kind: "error", text: "고객 이름을 입력해 주세요." });
      return;
    }
    setBusy(true);
    const now = new Date().toISOString();
    const { canDelete: _ignored, ...rest } = editing;
    void _ignored;
    const booking: Booking = { ...rest, id: editing.id ?? newBookingId(), createdAt: now, updatedAt: now, owner: author, ownerId: "", history: editing.history ?? [] };
    const error = await bookings.save(booking);
    setBusy(false);
    if (error) setMessage({ kind: "error", text: error });
    else {
      setMessage({ kind: "ok", text: "저장했습니다." });
      setEditing(null);
    }
  };

  const remove = async () => {
    if (!editing?.id) return;
    setBusy(true);
    const error = await bookings.remove(editing.id);
    setBusy(false);
    if (error) setMessage({ kind: "error", text: error });
    else {
      setMessage({ kind: "ok", text: "삭제했습니다." });
      setEditing(null);
    }
  };

  return (
    <>
      <button type="button" onClick={open} className={buttonClassName} aria-haspopup="dialog">
        <CalendarCheck className="h-3.5 w-3.5" aria-hidden />
        <span>예약 관리</span>
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="bookings-title"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-4xl rounded-xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-900/40"
      >
        <div className="flex max-h-[90dvh] flex-col">
          <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <div>
              <h2 id="bookings-title" className="text-sm font-semibold text-slate-900">
                예약 관리
              </h2>
              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                {bookings.cloud ? <Cloud className="h-3 w-3" aria-hidden /> : <HardDrive className="h-3 w-3" aria-hidden />}
                {bookings.cloud ? "팀 공용 (서버 저장)" : "이 브라우저에만 저장"}
                {Object.entries(receivable).length > 0 && (
                  <span className="ml-2 font-medium text-slate-700">
                    받을 돈: {Object.entries(receivable).map(([c, v]) => formatMoney(v ?? 0, c as Booking["currency"])).join(" · ")}
                  </span>
                )}
                {alertCount > 0 && <span className="ml-2 font-semibold text-rose-600">확인 필요 {alertCount}건</span>}
                {followUps > 0 && <span className="ml-2 font-semibold text-amber-700">연락할 고객 {followUps}건</span>}
              </p>
            </div>
            <button type="button" onClick={() => dialogRef.current?.close()} aria-label="닫기" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </header>

          <div className="space-y-3 overflow-y-auto p-4 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => startNew(true)} className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-700">
                <Plus className="h-3.5 w-3.5" aria-hidden />
                지금 견적으로 예약 만들기
              </button>
              <button type="button" onClick={() => startNew(false)} className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">
                빈 예약
              </button>
              <div role="radiogroup" aria-label="상태로 거르기" className="ml-auto flex flex-wrap gap-1">
                {(["active", "all", ...BOOKING_STATUSES] as Filter[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    role="radio"
                    aria-checked={filter === f}
                    onClick={() => setFilter(f)}
                    className={`rounded-full px-2 py-0.5 text-[11px] ${filter === f ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                  >
                    {f === "active" ? "진행 중" : f === "all" ? `전체 ${list.length}` : `${STATUS_LABEL[f]} ${counts[f]}`}
                  </button>
                ))}
              </div>
            </div>

            {editing && (
              <section aria-label="예약 편집" className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
                <div className="grid gap-2 sm:grid-cols-4">
                  <Field label="고객(단체) 이름 *" wide>
                    <input value={editing.customerName} maxLength={60} onChange={(e) => set("customerName", e.target.value)} className={fieldClass} />
                  </Field>
                  <Field label="연락처">
                    <input value={editing.phone} maxLength={40} onChange={(e) => set("phone", e.target.value)} className={fieldClass} />
                  </Field>
                  <Field label="이메일">
                    <input value={editing.email} maxLength={100} onChange={(e) => set("email", e.target.value)} className={fieldClass} />
                  </Field>
                  <Field label="여행지" wide>
                    <input value={editing.destination} maxLength={100} onChange={(e) => set("destination", e.target.value)} className={fieldClass} />
                  </Field>
                  <Field label="출발일">
                    <input type="date" value={editing.departureDate} onChange={(e) => set("departureDate", e.target.value)} className={fieldClass} />
                  </Field>
                  <Field label="인원">{numberInput("travelers")}</Field>
                  <Field label={`판매 금액 (총액, ${editing.currency})`}>{numberInput("totalPrice")}</Field>
                  <Field label="계약금">{numberInput("depositAmount")}</Field>
                  <Field label="계약금 기한">
                    <input type="date" value={editing.depositDue} onChange={(e) => set("depositDue", e.target.value)} className={fieldClass} />
                  </Field>
                  <Field label="잔금 기한">
                    <input type="date" value={editing.balanceDue} onChange={(e) => set("balanceDue", e.target.value)} className={fieldClass} />
                  </Field>
                  <Field label="받은 금액 (합계)">{numberInput("paidAmount")}</Field>
                  <Field label="상태">
                    <select value={editing.status} onChange={(e) => set("status", e.target.value as BookingStatus)} className={fieldClass}>
                      {BOOKING_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="메모 (항공 발권, 객실 배정, 특이사항 등)" wide>
                    <textarea value={editing.memo} maxLength={2000} rows={2} onChange={(e) => set("memo", e.target.value)} className={fieldClass} />
                  </Field>
                </div>
                <ReviewLinkBox
                  memo={editing.memo}
                  title={editing.planName || `${editing.destination} 여행`}
                  planName={editing.planName}
                  company={companyName}
                  onAppendMemo={(line) => set("memo", `${editing.memo ? `${editing.memo}\n` : ""}${line}`.slice(0, 2000))}
                />
                <p className="text-[11px] text-slate-500">
                  미수금 {formatMoney(Math.max(0, editing.totalPrice - editing.paidAmount), editing.currency)} · 계약금 기본값은 판매 금액의 10%, 잔금 기한은 출발 30일 전입니다(고칠 수 있음).
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" disabled={busy} onClick={() => void save()} className="rounded-md bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-700 disabled:bg-slate-300">
                    저장
                  </button>
                  <button type="button" onClick={() => setEditing(null)} className="rounded-md border border-slate-300 bg-white px-3 py-1.5">
                    닫기
                  </button>
                  {editing.id && editing.canDelete !== false && !confirmDelete && (
                    <button type="button" onClick={() => setConfirmDelete(true)} className="ml-auto inline-flex items-center gap-1 text-rose-600 hover:underline">
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      삭제
                    </button>
                  )}
                  {confirmDelete && (
                    <span className="ml-auto flex items-center gap-2 text-rose-700">
                      이 예약을 삭제할까요? 되돌릴 수 없습니다.
                      <button type="button" disabled={busy} onClick={() => void remove()} className="rounded-md bg-rose-600 px-2 py-1 font-semibold text-white">
                        삭제
                      </button>
                      <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-md border border-rose-200 bg-white px-2 py-1">
                        취소
                      </button>
                    </span>
                  )}
                </div>
                {editing.history && editing.history.length > 0 && (
                  <details>
                    <summary className="cursor-pointer text-[11px] font-medium text-slate-600">변경 이력 ({editing.history.length})</summary>
                    <ul className="mt-1 space-y-0.5 text-[11px] text-slate-500">
                      {editing.history.map((h, i) => (
                        <li key={`${h.at}-${i}`}>
                          {localTime(h.at)} · {h.by} · {h.text}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </section>
            )}

            {message && (
              <p role={message.kind === "error" ? "alert" : "status"} className={`rounded-md px-2.5 py-2 text-[11px] ${message.kind === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>
                {message.text}
              </p>
            )}

            {bookings.list === null ? (
              <p className="text-slate-500">불러오는 중...</p>
            ) : shown.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 px-3 py-8 text-center text-slate-500">
                {list.length === 0 ? "아직 예약이 없습니다. 견적을 낸 뒤 \"지금 견적으로 예약 만들기\"를 누르세요." : "이 상태의 예약이 없습니다."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-[11px]">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500">
                      <th className="py-1.5 pr-2 font-medium">출발</th>
                      <th className="py-1.5 pr-2 font-medium">고객</th>
                      <th className="py-1.5 pr-2 font-medium">여행</th>
                      <th className="py-1.5 pr-2 text-right font-medium">판매 금액</th>
                      <th className="py-1.5 pr-2 text-right font-medium">미수금</th>
                      <th className="py-1.5 pr-2 font-medium">상태</th>
                      <th className="py-1.5 font-medium">알림</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {shown.map((b) => {
                      const alerts = bookingAlerts(b);
                      return (
                        <tr key={b.id} onClick={() => edit(b)} className="cursor-pointer hover:bg-slate-50">
                          <td className="py-1.5 pr-2 tabular-nums">{b.departureDate || "미정"}</td>
                          <td className="py-1.5 pr-2">
                            <span className="font-semibold">{b.customerName}</span>
                            {b.phone && <span className="block text-slate-400">{b.phone}</span>}
                          </td>
                          <td className="py-1.5 pr-2">
                            {b.destination} {b.nights > 0 || b.days > 0 ? `${b.nights}박${b.days}일` : ""} · {b.travelers}명
                            <span className="block text-slate-400">담당 {b.owner}</span>
                          </td>
                          <td className="py-1.5 pr-2 text-right tabular-nums">{formatMoney(b.totalPrice, b.currency)}</td>
                          <td className="py-1.5 pr-2 text-right tabular-nums">{formatMoney(Math.max(0, b.totalPrice - b.paidAmount), b.currency)}</td>
                          <td className="py-1.5 pr-2">
                            <span className={`rounded px-1.5 py-0.5 font-semibold ${STATUS_TONE[b.status]}`}>{STATUS_LABEL[b.status]}</span>
                          </td>
                          <td className="py-1.5">
                            {alerts.map((a) => (
                              <span key={a.text} className={`mr-1 inline-flex items-center gap-0.5 font-medium ${a.level === "danger" ? "text-rose-600" : "text-amber-700"}`}>
                                <AlertTriangle className="h-3 w-3" aria-hidden />
                                {a.text}
                              </span>
                            ))}
                            {alerts.some((a) => a.text.includes("고객 연락")) && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void markContacted(b);
                                }}
                                className="rounded border border-amber-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 hover:bg-amber-50"
                              >
                                연락했어요
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
