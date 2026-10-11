import { describe, expect, it } from "vitest";
import { closedIssues } from "@/lib/closedDays";
import { fitCourse } from "@/lib/courseFit";
import { applyDayMove, refitDay, suggestDayMoves } from "@/lib/dayBalance";
import { fixDayStructure } from "@/lib/dayStructure";
import { addPlace } from "@/lib/differentiate";
import { fixImpossible, newHardIssues, tripHardIssues } from "@/lib/feasibility";
import { shortenOne } from "@/lib/nightsChange";
import { applyPackageRules, packageRules } from "@/lib/packageRules";
import { paceIssues } from "@/lib/pace";
import type { DayPlan, OperatingModel, ProductTier, TravelType } from "@/types";
import { flight, input } from "./fixtures";
import { applyFlightWithMeals } from "@/lib/flightApply";
import { renameOrigin } from "@/lib/flightOrigin";
import { danangTrip, macauTrip, pattayaTrip } from "./scenarioFixtures";

/**
 * 회귀 시나리오 — 실제 상품 모양에 자동 기능을 하나씩 다 돌려, 새 불가능 시간(새벽 도착일 관광·운영 시간 밖·
 * 말이 안 되는 식사 시각·체크인 뒤·출국 뒤)이 생기지 않는지 본다. 기능을 고칠 때마다 이 테스트가 먼저 막는다.
 */
const SCENARIOS: { name: string; days: () => DayPlan[]; destination: string; dayEnd: string; depart: string }[] = [
  { name: "파타야·방콕 4박6일 (새벽 도착)", days: pattayaTrip, destination: "파타야, 방콕", dayEnd: "21:30", depart: "20:30" },
  { name: "다낭 3박5일 (오전 도착·새벽 귀국)", days: danangTrip, destination: "다낭", dayEnd: "21:30", depart: "07:00" },
  { name: "마카오 2박3일 (오후 도착·저녁 출국)", days: macauTrip, destination: "마카오", dayEnd: "21:30", depart: "10:15" },
];

const PRODUCTS: { model: OperatingModel; tier: ProductTier; travelType: TravelType }[] = [
  { model: "full", tier: "value", travelType: "package" },
  { model: "full", tier: "standard", travelType: "package" },
  { model: "full", tier: "premium", travelType: "senior" },
  { model: "semi", tier: "signature", travelType: "semi" },
  { model: "private", tier: "premium", travelType: "honeymoon" },
];

for (const s of SCENARIOS) {
  describe(`회귀 시나리오: ${s.name}`, () => {
    const base = s.days();
    const expectNoNew = (after: DayPlan[], what: string) => {
      const added = newHardIssues(base, after, {}, s.dayEnd).map((i) => `DAY ${i.day} ${i.text}`);
      expect(added, what).toEqual([]);
    };

    it("원래 상품에는 불가능 시간이 없다", () => {
      expect(tripHardIssues(base, {}, s.dayEnd).map((i) => i.text)).toEqual([]);
    });

    it("규칙대로 정리 (운영 방식·등급·고객 5가지)", () => {
      for (const p of PRODUCTS) {
        const inp = input({ destination: s.destination, operatingModel: p.model, productTier: p.tier, travelType: p.travelType, nights: base.length - 1, tipPerPerson: 10, options: [] });
        const r = applyPackageRules(base, {}, packageRules(inp), inp);
        expectNoNew(r.days, `${p.model}·${p.tier}·${p.travelType}`);
      }
    });

    it("코스 재정렬·구성 정리·불가능 시간 고치기", () => {
      expectNoNew(fitCourse(base, { walk: false, slot: true }).days, "재정렬");
      expectNoNew(base.map(fixDayStructure), "구성 정리");
      expectNoNew(fixImpossible(base, {}, refitDay, s.dayEnd).days, "불가능 시간 고치기");
    });

    it("일정 나누기 제안·쉬는 날·박수 줄이기", () => {
      for (const m of suggestDayMoves(base, {})) expectNoNew(applyDayMove(base, m), `일정 나누기 ${m.label}`);
      for (const pace of ["relaxed", "normal"] as const)
        for (const issue of paceIssues(base, {}, pace)) for (const f of issue.fixes) if (f.days) expectNoNew(f.days, `쉬는 날 ${f.label}`);
      const short = shortenOne(base, {});
      if (short) expectNoNew(short.days, "박수 줄이기");
    });

    it("항공편 적용·출발지 맞추기", () => {
      // 원래 상품과 같은 시각의 인천 출발 편 (도착 시각 모름 → 노선표·시차표로)
      const f = flight({ departAirport: "인천(ICN)", departTime: s.depart, arriveAirport: "", arriveTime: "", returnDepartAirport: "", returnDepartTime: "" });
      expectNoNew(applyFlightWithMeals(base, f), "항공편 적용");
      expectNoNew(renameOrigin(base, "인천"), "출발지 맞추기");
    });

    it("휴무일 옮기기·인기 장소 넣기", () => {
      for (const c of closedIssues({ departureDate: "2026-11-02" }, base, {})) if (c.days) expectNoNew(c.days, `휴무일 ${c.name}`);
      for (const name of ["왓 프라깨우", "야경 투어", "쿠킹 클래스"]) {
        const r = addPlace(base, {}, { name, agencies: ["하나투어"], score: null }, null);
        if (r) expectNoNew(r.days, `인기 장소 ${name}`);
      }
    });
  });
}
