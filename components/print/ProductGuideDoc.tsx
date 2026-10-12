import { findScript, tripPlacesByCity, withDefaultBasics } from "@/lib/guideBook";
import { dayItems } from "@/lib/itinerary";
import { dayDate, tripPeriod } from "@/lib/documents";
import { dayRegion, shoppingStops } from "@/lib/itineraryDoc";
import { knowledgeKey } from "@/lib/knowledge";
import type { DocProps } from "./DocShell";
import { GuideBookDoc, type GuideDocDay } from "./GuideBookDoc";

const NOT_SCRIPT = new Set(["flight", "transfer", "hotel", "free_time", "meal"]);

/** 비상 연락 줄 — 여행 정보(현지 응급·대사관) + 회사 비상연락 */
export function emergencyRows(travelInfo: DocProps["travelInfo"], company: DocProps["company"]): { label: string; value: string }[] {
  return [
    { label: "현지 응급", value: travelInfo?.emergency ?? "" },
    { label: "대사관·영사관", value: travelInfo?.embassy ?? "" },
    { label: "회사 비상연락", value: company.emergencyContact.trim() },
    { label: "회사 전화", value: company.phone.trim() },
  ].filter((r) => r.value);
}

/**
 * 상품별 가이드 해설집 — 이 상품 일정 순서대로 날짜별 장소 원고 + 상품 원칙 + 진행 멘트·기본기·비상 대응 + 비상 연락 + 현지 회화.
 * 원고는 인쇄 직전에 가이드 해설집(서버)에서 이 일정 도시들 것을 불러온다 (data.guide).
 */
export function ProductGuideDoc({ input, days, pmChoice, meta, company, quote, travelInfo, guide }: DocProps) {
  const kits = guide?.kits ?? [];
  const all = kits.flatMap((k) => k.scripts);
  const origin = input.originCity?.trim() || "인천";
  const docDays: GuideDocDay[] = days.map((d, i) => {
    const date = dayDate(input, d.day);
    const seen = new Set<string>();
    const places = dayItems(d, pmChoice)
      .filter((it) => !NOT_SCRIPT.has(it.type ?? "sightseeing"))
      .filter((it) => {
        const k = knowledgeKey(it.name);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .map((it) => ({ name: it.name, script: findScript(all, it.name) }));
    return { label: `제${d.day}일${date ? ` · ${date}` : ""} · ${dayRegion(days, i, origin)}${d.theme ? ` — ${d.theme}` : ""}`, places };
  });
  const shops = shoppingStops(days, pmChoice);
  const principles = [
    shops.length === 0 ? "노쇼핑 — 쇼핑센터 방문·권유를 하지 않습니다." : `쇼핑 ${shops.length}곳 — 일정표에 적힌 곳만, 머무는 시간을 지킵니다.`,
    input.options.length === 0 ? "노옵션 — 선택관광을 권하지 않습니다." : `선택관광 ${input.options.length}개 — 원하는 분만, 참여하지 않는 분의 대체 일정·대기 장소를 함께 안내합니다.`,
    input.tipPerPerson > 0 ? "가이드·기사 경비 상품가 포함 — 현지에서 따로 받지 않습니다." : "가이드·기사 경비 현지 지불 — 출발 전 안내한 금액만 첫날 안내합니다.",
    meta?.hotelGrade ? `숙소 ${meta.hotelGrade}` : "",
  ].filter(Boolean);
  const phrases = kits.flatMap((k) => k.phrases).filter((p, i, list) => list.findIndex((x) => x.ko === p.ko && x.local === p.local) === i);
  const places = Object.values(tripPlacesByCity(days, pmChoice, input.destination)).flat().length;

  return (
    <GuideBookDoc
      company={company}
      title="가이드 해설집"
      subtitle={`${meta?.packageName || input.destination} · ${tripPeriod(input)} · ${quote.travelers}명 · 장소 ${places}곳`}
      days={docDays}
      basics={guide?.basics ?? withDefaultBasics(null)}
      phrases={phrases}
      emergency={emergencyRows(travelInfo, company)}
      principles={principles}
      travelers={quote.travelers}
    />
  );
}
