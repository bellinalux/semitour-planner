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

/** 제목 줄, 본문, 회사 표시(법정 항목)와 발행일을 담는 A4 문서 틀 */
export function DocShell({ title, subtitle, company, children }: ShellProps) {
  const lines = companyLines(company);

  return (
    <article className="mx-auto max-w-[190mm] break-keep bg-white p-8 text-[11px] leading-5 text-slate-900 print:p-0">
      <header className="flex items-end justify-between gap-4 border-b-2 border-slate-800 pb-3">
        <div className="flex items-end gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- 인쇄 문서는 next/image 최적화 대상이 아니라 일반 img로 넣는다 */}
          <img src="/logo-mark.png" alt="" aria-hidden className="h-9 w-9 shrink-0 object-contain" />
          <div>
            <h1 className="text-xl font-bold tracking-tight">{title}</h1>
            <p className="mt-1 text-xs text-slate-600">{subtitle}</p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          {company.name && <p className="text-sm font-semibold">{company.name}</p>}
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
      <h2 className="mb-1.5 border-l-4 border-slate-800 pl-2 text-[13px] font-bold">{title}</h2>
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
          <tr key={row.label} className="border-b border-slate-200">
            <th scope="row" className="w-32 shrink-0 bg-slate-50 px-2 py-1.5 text-left align-top font-medium text-slate-600">
              {row.label}
            </th>
            <td className="px-2 py-1.5 align-top">{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
