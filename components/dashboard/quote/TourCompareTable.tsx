import { Check, ExternalLink, Minus, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import type { CompetitorRefreshView } from "@/hooks/useCompetitorRefresh";
import { formatMoney } from "@/lib/currency";
import { samePlace } from "@/lib/places";
import { includeLabel, INCLUDE_KEYS, policyLabel, type CompareColumn, type TourCompare } from "@/lib/tourCompare";
import type { CurrencyCode, TourPolicy } from "@/types";

interface Props {
  compare: TourCompare;
  currency: CurrencyCode;
  /** 검색으로 넣은 경쟁 상품이 있을 때만 — 방문지·호텔 등급·가격 다시 조회 */
  refresh?: CompetitorRefreshView | null;
}

const TONE = {
  good: "text-emerald-700",
  bad: "text-red-600",
  neutral: "text-slate-700",
} as const;

function Policy({ value }: { value: TourPolicy }) {
  const tone = value === "none" ? "bg-emerald-50 text-emerald-700" : value === "some" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500";
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${tone}`}>{policyLabel(value)}</span>;
}

function Places({ column, sharedByOthers }: { column: CompareColumn; sharedByOthers: string[] }) {
  if (column.places.length === 0) return <span className="text-slate-400">모름</span>;
  return (
    <ul className="space-y-0.5">
      {column.places.map((p) => {
        const shared = column.isOurs ? sharedByOthers.includes(p) : column.overlap.some((o) => samePlace(o, p));
        return (
          <li key={p} className={shared ? "font-medium text-indigo-700" : ""}>
            {p}
          </li>
        );
      })}
    </ul>
  );
}

/** 투어 비교표 — 우리 상품과 경쟁 상품(최대 4개)을 같은 조건 가격·호텔·포함·쇼핑/옵션·방문지로 나란히 비교하고 한 줄 판정을 붙인다 */
export function TourCompareTable({ compare, currency, refresh }: Props) {
  const unknownPlaces = compare.columns.filter((c) => !c.isOurs && c.places.length === 0).length;
  const money = (v: number | null) => (v === null ? <span className="text-slate-400">모름</span> : formatMoney(Math.round(v), currency));
  const shared = [...new Set(compare.columns.flatMap((c) => c.overlap))];
  const verdict = Object.fromEntries(compare.verdicts.map((v) => [v.id, v]));
  const rows: { label: string; cell: (c: CompareColumn) => ReactNode }[] = [
    {
      label: "같은 조건 1인가",
      cell: (c) => <span className="font-semibold text-slate-900">{money(c.price)}</span>,
    },
    { label: "표시 가격", cell: (c) => money(c.listedPrice) },
    {
      label: "일정",
      cell: (c) => c.span || <span className="text-slate-400">모름</span>,
    },
    {
      label: "호텔",
      cell: (c) => c.hotelGrade || <span className="text-slate-400">모름</span>,
    },
    {
      label: "포함",
      cell: (c) => (
        <ul className="space-y-0.5">
          {INCLUDE_KEYS.map((k) => (
            <li key={k} className="flex items-center gap-1">
              {c.includes[k] ? (
                <Check className="size-3 text-emerald-600" aria-label="포함" />
              ) : (
                <Minus className="size-3 text-slate-300" aria-label="미포함" />
              )}
              <span className={c.includes[k] ? "" : "text-slate-400"}>{includeLabel(k)}</span>
            </li>
          ))}
        </ul>
      ),
    },
    { label: "쇼핑", cell: (c) => <Policy value={c.shopping} /> },
    { label: "선택관광", cell: (c) => <Policy value={c.optionTour} /> },
    { label: "방문지", cell: (c) => <Places column={c} sharedByOthers={shared} /> },
    {
      label: "우리에겐 없는 곳",
      cell: (c) =>
        c.isOurs ? (
          <span className="text-slate-400">—</span>
        ) : c.places.length === 0 ? (
          <span className="text-slate-400">모름</span>
        ) : c.theirOnly.length === 0 ? (
          <span className="text-emerald-700">없음</span>
        ) : (
          <span className="text-pretty text-amber-800">{c.theirOnly.join(", ")}</span>
        ),
    },
    {
      label: "특징",
      cell: (c) => (c.isOurs ? <span className="text-slate-400">—</span> : c.highlight ? <span className="text-pretty">{c.highlight}</span> : <span className="text-slate-400">—</span>),
    },
    {
      label: "판정",
      cell: (c) =>
        c.isOurs ? (
          <span className="text-slate-500">기준</span>
        ) : (
          <span className={`text-pretty ${TONE[verdict[c.id]?.tone ?? "neutral"]}`}>{verdict[c.id]?.text}</span>
        ),
    },
  ];

  return (
    <div className="space-y-2">
      <p className="text-pretty rounded-md bg-slate-50 px-3 py-2 text-[11px] leading-4 text-slate-600 ring-1 ring-slate-200">
        <span className="font-semibold text-slate-800">{compare.position}</span> — 경쟁 가격은 우리 상품과 같은 조건(우리가 포함한 항공·숙박, 현지 지불
        경비)으로 맞춘 1인 가격입니다 (2인 1실 기준).
        {compare.onlyOurs.length > 0 && <> 경쟁 상품에 없는 우리만의 방문지: {compare.onlyOurs.join(", ")}.</>}
      </p>
      {(compare.summary.strengths.length > 0 || compare.summary.weaknesses.length > 0) && (
        <div className="grid gap-2 text-[11px] leading-4 sm:grid-cols-2">
          <div className="rounded-md border border-emerald-200 bg-emerald-50/60 px-3 py-2">
            <p className="font-semibold text-emerald-900">우리가 나은 점</p>
            {compare.summary.strengths.length === 0 ? (
              <p className="text-slate-500">눈에 띄는 강점이 없습니다 — 포함 항목·노쇼핑·방문지로 차별점을 만드세요.</p>
            ) : (
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-emerald-900">
                {compare.summary.strengths.map((s) => (
                  <li key={s} className="text-pretty">
                    {s}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2">
            <p className="font-semibold text-amber-900">경쟁 상품이 나은 점 (보완할 곳)</p>
            {compare.summary.weaknesses.length === 0 ? (
              <p className="text-slate-500">경쟁 상품보다 뒤지는 점이 없습니다.</p>
            ) : (
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-amber-900">
                {compare.summary.weaknesses.map((s) => (
                  <li key={s} className="text-pretty">
                    {s}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      {compare.summary.scopeNotes.length > 0 && (
        <ul className="list-disc space-y-0.5 rounded-md bg-slate-50 py-1.5 pl-7 pr-3 text-[11px] leading-4 text-slate-600 ring-1 ring-slate-200">
          {compare.summary.scopeNotes.map((s) => (
            <li key={s} className="text-pretty">
              {s}
            </li>
          ))}
        </ul>
      )}
      {refresh && (
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className={`flex-1 text-pretty ${refresh.failed ? "text-red-600" : "text-slate-500"}`} role={refresh.message ? "status" : undefined}>
            {refresh.message ??
              (unknownPlaces > 0
                ? `경쟁 상품 ${unknownPlaces}개는 방문지를 아직 모릅니다 — 다시 조회하면 방문지·호텔 등급·가격을 새로 채웁니다.`
                : "다시 조회하면 검색으로 넣은 경쟁 상품의 가격·방문지를 새로 고칩니다.")}
          </span>
          <button
            type="button"
            onClick={refresh.run}
            disabled={refresh.running}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:text-slate-400"
          >
            <RefreshCw className={`size-3.5 ${refresh.running ? "motion-safe:animate-spin" : ""}`} aria-hidden />
            {refresh.running ? "다시 조회 중..." : "경쟁 상품 다시 조회"}
          </button>
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[560px] text-[11px]">
          <caption className="sr-only">투어 비교표</caption>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left">
              <th scope="col" className="w-20 px-2 py-1.5 font-medium text-slate-500">
                항목
              </th>
              {compare.columns.map((c) => (
                <th key={c.id} scope="col" className={`px-2 py-1.5 align-top font-semibold ${c.isOurs ? "bg-indigo-50 text-indigo-900" : "text-slate-800"}`}>
                  <span className="line-clamp-2">{c.name}</span>
                  {c.link && (
                    <a
                      href={c.link}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] font-normal text-slate-500 underline underline-offset-2"
                    >
                      판매 페이지
                      <ExternalLink className="size-2.5" aria-hidden />
                    </a>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 tabular-nums text-slate-700">
            {rows.map((r) => (
              <tr key={r.label}>
                <th scope="row" className="px-2 py-1.5 text-left align-top font-medium text-slate-500">
                  {r.label}
                </th>
                {compare.columns.map((c) => (
                  <td key={c.id} className={`px-2 py-1.5 align-top ${c.isOurs ? "bg-indigo-50/40" : ""}`}>
                    {r.cell(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-slate-400">
        파란 글씨 방문지는 우리 일정과 겹치는 곳입니다. 경쟁 상품의 방문지·호텔 등급은 웹 검색으로 찾을 때 채워집니다.
      </p>
    </div>
  );
}
