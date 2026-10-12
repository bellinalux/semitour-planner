"use client";

import { Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { emergencyRows } from "@/components/print/ProductGuideDoc";
import { GuideBookDoc } from "@/components/print/GuideBookDoc";
import { normalizeCompany } from "@/lib/company";
import type { GuideBasics, GuideCityKit } from "@/lib/guideBook";
import { fetchKits } from "@/lib/guideBookClient";
import type { TravelInfo } from "@/lib/schemas/travelInfo";
import type { CompanyProfile } from "@/types";

function readCompany(): CompanyProfile {
  try {
    return normalizeCompany(JSON.parse(localStorage.getItem("semitour-planner:company:v1") ?? "null"));
  } catch {
    return normalizeCompany(null);
  }
}

/**
 * 도시 교육 자료 — 그 도시 장소 원고 전체 + 진행 멘트·기본기·비상 대응·상품 원칙(공통) + 비상 연락 + 현지 회화.
 * 다 불러오면 인쇄 창을 연다 (PDF로 저장해 신입 교육 교재로 쓴다).
 */
export function CityGuidePrint({ city, lang = "ko" }: { city: string; lang?: "ko" | "en" }) {
  const [data, setData] = useState<{ kit: GuideCityKit; basics: GuideBasics; info: TravelInfo | null; company: CompanyProfile } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!city) return;
    let alive = true;
    void (async () => {
      try {
        const [{ kits, basics }, info] = await Promise.all([
          fetchKits([city]),
          fetch("/api/travel-info", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ destination: city }) })
            .then((r) => (r.ok ? (r.json() as Promise<TravelInfo>) : null))
            .catch(() => null),
        ]);
        if (alive) setData({ kit: kits[0], basics, info, company: readCompany() });
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "불러오지 못했습니다.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [city]);

  // 다 그려지면 인쇄 창
  useEffect(() => {
    if (!data) return;
    const t = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(t);
  }, [data]);

  if (!city) return <p className="p-8 text-sm text-slate-600">도시를 고르고 다시 열어 주세요.</p>;
  if (error) return <p className="p-8 text-sm text-rose-700">{error}</p>;
  if (!data) return <p className="p-8 text-sm text-slate-500">{city} 교육 자료를 불러오는 중…</p>;
  const scripts = [...data.kit.scripts].sort((a, b) => Number(b.status === "reviewed") - Number(a.status === "reviewed") || a.name.localeCompare(b.name, "ko"));
  return (
    <main className="bg-slate-100 py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-3 flex max-w-[190mm] items-center justify-end gap-2 print:hidden">
        <span className="mr-auto text-xs text-slate-500">인쇄 창에서 “PDF로 저장”을 고르면 교육 교재 파일이 됩니다.</span>
        <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700">
          <Printer className="size-3.5" aria-hidden />
          인쇄
        </button>
      </div>
      <div className="print-root" style={{ display: "block" }}>
        <GuideBookDoc
          company={data.company}
          title={`${data.kit.city} 가이드 교육 자료${lang === "en" ? " (English)" : ""}`}
          subtitle={`장소 원고 ${scripts.length}곳 (검수 완료 ${scripts.filter((s) => s.status === "reviewed").length}곳) · 진행 멘트·기본기·비상 대응 · 현지 회화`}
          scripts={scripts}
          basics={data.basics}
          phrases={data.kit.phrases}
          emergency={emergencyRows(data.info, data.company)}
          principles={[]}
          travelers={20}
          lang={lang}
        />
      </div>
    </main>
  );
}
