import { companyLines } from "@/lib/company";
import { QrCode } from "./QrCode";
import { formatToday } from "@/lib/documents";
import type { CompanyProfile, CourseMeta, DayPlan, QuoteData, TripInput } from "@/types";
import type { PmChoice } from "@/lib/itinerary";
import type { SeasonResponse } from "@/lib/schemas/season";
import type { TravelInfo } from "@/lib/schemas/travelInfo";

/** 인쇄 문서 세 종류가 함께 쓰는 자료 */
export interface DocProps {
  input: TripInput;
  days: DayPlan[];
  pmChoice: PmChoice;
  /** 고객 문서에 쓰는 견적. 선택한 판매 채널의 소비자가로 가격만 바꾼 것일 수 있다 */
  quote: QuoteData;
  /** 채널·수수료·마진을 모두 볼 수 있는 원래 견적 (내부 검토서용). 없으면 quote와 같다 */
  rawQuote?: QuoteData;
  meta: CourseMeta | null;
  company: CompanyProfile;
  /** 영문 문서용 번역 (한글 글 → 영어) */
  translations?: Record<string, string>;
  /** 언어별 번역표 (영어·일본어·중국어 문서) */
  translationsByLang?: Partial<Record<"en" | "ja" | "zh", Record<string, string>>>;
  /** 일정표 「여행 정보」 (시차·전압·통화·입국·긴급 연락처) */
  travelInfo?: TravelInfo | null;
  /** 출발 시기 확인 (날씨) */
  season?: SeasonResponse | null;
  /** 웹 일정표(공유 링크) 주소 — 있으면 QR 코드로 넣는다 */
  shareUrl?: string | null;
}

interface ShellProps {
  title: string;
  subtitle: string;
  company: CompanyProfile;
  children: React.ReactNode;
}

/** 제목 줄, 본문, 회사 표시(법정 항목)와 발행일을 담는 A4 문서 틀. 컬러 인쇄를 기준으로 브랜드 초록을 포인트로 쓴다. */
/** 회사가 고른 문서 강조색 (없으면 기본 초록) */
export const docAccent = (company: CompanyProfile) => company.docColor || "#059669";

/** CSS 문자열 안에 넣을 글 (따옴표·역슬래시·줄바꿈 처리) */
const cssText = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]+/g, " ");

/**
 * 모든 쪽 아래 꼬리말 — 회사(법정 표시 항목)와 쪽 번호. 문서 끝에 따로 두면 마지막 쪽이 꽉 찼을 때 그 줄만 다음 쪽으로 넘어가
 * 빈 쪽이 생겨서, 인쇄 쪽 여백(@page 아래)에 반복해서 찍는다.
 */
export function PageFooterStyle({ company, text }: { company: CompanyProfile; text?: string }) {
  const lines = companyLines(company);
  const left = text ?? (lines.length > 0 ? lines.join(" · ") : "회사 정보 미입력 — 회사 설정에서 등록번호·보증보험을 입력하세요");
  const emergency = text === undefined ? company.emergencyContact.trim() : "";
  return (
    <style>{`@media print { @page { @bottom-left { content: "${cssText(left)}${emergency ? ` · 비상연락 ${cssText(emergency)}` : ""}"; font-size: 6.5pt; color: #64748b; vertical-align: top; padding-top: 2mm; } @bottom-right { content: counter(page) " / " counter(pages); font-size: 7pt; color: #64748b; vertical-align: top; padding-top: 2mm; } } }`}</style>
  );
}

export function DocShell({ title, subtitle, company, children }: ShellProps) {
  const accent = docAccent(company);

  return (
    <article className="mx-auto max-w-[190mm] break-keep bg-white p-8 text-[11px] leading-5 text-slate-900 print:p-0">
      <PageFooterStyle company={company} />
      <div className="h-1.5 rounded-t print:rounded-none" style={{ background: accent }} aria-hidden />
      <header className="flex items-end justify-between gap-4 border-b-2 px-1 pb-3 pt-3" style={{ borderColor: accent }}>
        <div className="flex items-end gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- 인쇄 문서는 next/image 최적화 대상이 아니라 일반 img로 넣는다 */}
          <img src={company.logo || "/logo-mark.png"} alt="" aria-hidden className="h-9 w-9 shrink-0 object-contain" />
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ color: accent }}>{title}</h1>
            <p className="mt-1 text-xs text-slate-600">{subtitle}</p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          {company.name && <p className="text-sm font-semibold" style={{ color: accent }}>{company.name}</p>}
          <p className="mt-0.5 text-[11px] text-slate-500">발행일 {formatToday()}</p>
        </div>
      </header>

      <div className="mt-4 space-y-5">{children}</div>
    </article>
  );
}

/**
 * 문서 안의 한 구획. 쪽 중간에서 나뉠 수 있다(통째로 다음 쪽으로 넘기면 앞 쪽이 비어서) — 제목만 다음 줄과 붙는다.
 * keep: 짧은 구획(몇 줄짜리 표)은 한 쪽에 모아 둔다.
 */
export function DocSection({ title, children, keep = false }: { title: string; children: React.ReactNode; keep?: boolean }) {
  return (
    <section className={keep ? "break-inside-avoid" : undefined}>
      <h2 className="mb-1.5 border-l-4 border-emerald-600 pl-2 text-[13px] font-bold text-emerald-900" style={{ breakAfter: "avoid" }}>
        {title}
      </h2>
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

/**
 * 표지 — 고객 이름이 있으면 일정표 첫 장에 "○○님을 위한 여행" 표지를 붙인다 (회사 로고·강조색, 대표 사진이 있으면 함께).
 */
export function DocCoverPage({ company, customer, title, period, travelers, photo, qr }: { company: CompanyProfile; customer: string; title: string; period: string; travelers: string; photo?: string; qr?: string }) {
  const accent = docAccent(company);
  return (
    <section className="mx-auto flex min-h-[250mm] max-w-[190mm] flex-col items-center justify-center gap-5 bg-white p-8 text-center" style={{ breakAfter: "page" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- 인쇄 문서 */}
      <img src={company.logo || "/logo-mark.png"} alt="" aria-hidden className="h-16 w-16 object-contain" />
      <p className="text-sm font-semibold" style={{ color: accent }}>
        {customer}님을 위한 여행
      </p>
      <h1 className="text-balance text-3xl font-bold text-slate-900">{title}</h1>
      {photo && (
        // eslint-disable-next-line @next/next/no-img-element -- 직접 올린 사진 data URL
        <img src={photo} alt="" aria-hidden className="max-h-[90mm] w-full max-w-[150mm] rounded-lg object-cover" />
      )}
      <p className="text-base text-slate-700">{period}</p>
      <p className="text-sm text-slate-500">{travelers}</p>
      <div className="mt-8 h-1 w-24 rounded" style={{ background: accent }} aria-hidden />
      {company.name && <p className="text-sm font-semibold text-slate-700">{company.name}</p>}
      {(company.phone || company.email) && <p className="text-xs text-slate-500">{[company.phone, company.email].filter(Boolean).join(" · ")}</p>}
      {qr && (
        <div className="mt-2 flex flex-col items-center gap-1">
          <QrCode text={qr} size={92} />
          <p className="text-[10px] text-slate-500">휴대폰으로 일정표 보기</p>
        </div>
      )}
    </section>
  );
}
