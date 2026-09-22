import { companyLines } from "@/lib/company";
import { formatToday } from "@/lib/documents";
import type { CompanyProfile, CourseMeta, DayPlan, QuoteData, TripInput } from "@/types";
import type { PmChoice } from "@/lib/itinerary";

/** 인쇄 문서 세 종류가 함께 쓰는 자료 */
export interface DocProps {
  input: TripInput;
  days: DayPlan[];
  pmChoice: PmChoice;
  quote: QuoteData;
  meta: CourseMeta | null;
  company: CompanyProfile;
}

interface ShellProps {
  title: string;
  subtitle: string;
  company: CompanyProfile;
  children: React.ReactNode;
}

/** 제목 줄, 본문, 회사 표시(법정 항목)와 발행일을 담는 A4 문서 틀. 컬러 인쇄를 기준으로 브랜드 초록을 포인트로 쓴다. */
export function DocShell({ title, subtitle, company, children }: ShellProps) {
  const lines = companyLines(company);

  return (
    <article className="mx-auto max-w-[190mm] break-keep bg-white p-8 text-[11px] leading-5 text-slate-900 print:p-0">
      <div className="h-1.5 rounded-t bg-emerald-600 print:rounded-none" aria-hidden />
      <header className="flex items-end justify-between gap-4 border-b-2 border-emerald-600 px-1 pb-3 pt-3">
        <div className="flex items-end gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- 인쇄 문서는 next/image 최적화 대상이 아니라 일반 img로 넣는다 */}
          <img src="/logo-mark.png" alt="" aria-hidden className="h-9 w-9 shrink-0 object-contain" />
          <div>
            <h1 className="text-xl font-bold tracking-tight text-emerald-900">{title}</h1>
            <p className="mt-1 text-xs text-slate-600">{subtitle}</p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          {company.name && <p className="text-sm font-semibold text-emerald-800">{company.name}</p>}
          <p className="mt-0.5 text-[11px] text-slate-500">발행일 {formatToday()}</p>
        </div>
      </header>

      <div className="mt-4 space-y-5">{children}</div>

      <footer className="mt-6 break-inside-avoid border-t border-slate-300 pt-3 text-[10px] leading-4 text-slate-600">
        {lines.length > 0 ? (
          lines.map((line) => <p key={line}>{line}</p>)
        ) : (
          <p className="text-slate-400">회사 정보가 입력되지 않았습니다. 화면 위 &quot;회사 설정&quot;에서 등록번호와 보증보험 내용을 입력하세요.</p>
        )}
      </footer>
    </article>
  );
}

/** 문서 안의 한 구획 */
export function DocSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid">
      <h2 className="mb-1.5 border-l-4 border-emerald-600 pl-2 text-[13px] font-bold text-emerald-900">{title}</h2>
      {children}
    </section>
  );
}

/** 라벨·값을 두 칸으로 늘어놓는 표 */
export function DocFacts({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <table className="w-full border-collapse">
      <tbody>
        {rows.map((row) => (
          <tr key={row.label} className="border-b border-emerald-100">
            <th scope="row" className="w-32 shrink-0 bg-emerald-50 px-2 py-1.5 text-left align-top font-medium text-emerald-800">
              {row.label}
            </th>
            <td className="px-2 py-1.5 align-top">{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * 여행일정표 첫 페이지에 넣는 표지 배너. 상품명·여행지·기간·인원·요금을 큼직하게 보여준다.
 * 인쇄 시 컬러(초록 그라데이션)로 나온다.
 */
export function DocCover({
  title,
  destination,
  period,
  travelers,
  priceLine,
}: {
  title: string;
  destination: string;
  period: string;
  travelers: string;
  priceLine: string;
}) {
  return (
    <div className="break-inside-avoid rounded-lg bg-gradient-to-br from-emerald-600 to-emerald-800 px-5 py-5 text-white">
      <p className="text-[11px] font-medium uppercase tracking-widest text-emerald-100">Travel Itinerary</p>
      <h2 className="mt-1 text-2xl font-bold leading-tight">{title}</h2>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px] text-emerald-50 sm:grid-cols-4">
        <p>
          <span className="block text-[10px] uppercase tracking-wide text-emerald-200">여행지</span>
          {destination || "-"}
        </p>
        <p>
          <span className="block text-[10px] uppercase tracking-wide text-emerald-200">기간</span>
          {period}
        </p>
        <p>
          <span className="block text-[10px] uppercase tracking-wide text-emerald-200">인원</span>
          {travelers}
        </p>
        <p>
          <span className="block text-[10px] uppercase tracking-wide text-emerald-200">여행경비</span>
          {priceLine}
        </p>
      </div>
    </div>
  );
}
