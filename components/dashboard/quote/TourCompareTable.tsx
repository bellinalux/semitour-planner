import { Check, ExternalLink, Minus } from "lucide-react";
import type { ReactNode } from "react";
import { formatMoney } from "@/lib/currency";
import { includeLabel, INCLUDE_KEYS, policyLabel, samePlace, type CompareColumn, type TourCompare } from "@/lib/tourCompare";
import type { CurrencyCode, TourPolicy } from "@/types";

interface Props {
  compare: TourCompare;
  currency: CurrencyCode;
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
export function TourCompareTable({ compare, currency }: Props) {
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
