import { describe, expect, it } from "vitest";
import { normalizeCompany } from "@/lib/company";
import { contractTermRisks, contractTerms, DEFAULT_SPECIAL_TERM_SETTINGS, entryNotes, riskOf, termChoices, termRegions } from "@/lib/specialTerms";
import { input } from "./fixtures";

const settings = { ...DEFAULT_SPECIAL_TERM_SETTINGS, airCancelFee: 130000, noShowFee: 100000, businessHours: "평일 09:00~18:00" };

describe("계약서 특약", () => {
  it("여행지에서 국가·지역을 알아낸다 (여러 도시 포함)", () => {
    expect(termRegions("오사카, 일본")).toEqual(["japan"]);
    expect(termRegions("다낭, 베트남")).toEqual(expect.arrayContaining(["vietnam", "sea"]));
    expect(termRegions("파리, 로마")).toEqual(["europe"]);
    expect(termRegions("런던")).toEqual(["uk"]);
    expect(termRegions("괌")).toEqual(["usa"]);
    expect(termRegions("제주")).toEqual([]);
  });

  it("항공 포함 일본 상품: 공통(항공 취소·불가항력 등) + 일본 특약을 추천하고, 회사 금액을 문구에 넣는다", () => {
    const i = input({ destination: "오사카, 일본", includesFlights: true, tripScope: "overseas" });
    const ids = termChoices(i, settings).filter((c) => c.on).map((c) => c.term.id);
    expect(ids).toEqual(expect.arrayContaining(["air-ticket", "force-majeure", "flight-delay", "group-seat", "business-days", "documents", "jp-disaster"]));
    expect(ids).not.toContain("prepaid"); // 선납은 직접 켠다
    expect(ids).not.toContain("th-tdac");
    const air = contractTerms(i, settings).find((t) => t.title === "항공권 발권 후 취소")!;
    expect(air.text).toContain("130,000");
    expect(air.text).toContain("노쇼 위약금 1인");
    expect(air.text).toContain("산정 근거를 제시");
  });

  it("상품별로 켜고 끄고, 회사에서 끈 것은 빠지고, 회사·상품 고유 특약이 더해진다", () => {
    const i = input({ destination: "방콕, 태국", includesFlights: true, tripScope: "overseas", specialTermOverrides: { prepaid: true, "group-seat": false }, customSpecialTerms: "송크란 기간 물놀이 피해는 개인 부담입니다." });
    const titles = contractTerms(i, { ...settings, disabled: ["sea-local"], custom: "모든 상품은 여행자보험에 가입되어 있습니다." }).map((t) => t.title);
    expect(titles).toContain("선납 상품의 실제 손해 배상");
    expect(titles).not.toContain("단체 항공권 제한");
    expect(titles).not.toContain("동남아 — 현지 경비·쇼핑센터");
    expect(titles).toContain("태국 — 디지털 입국카드(TDAC)");
    expect(titles.filter((t) => t === "회사 특약")).toHaveLength(2);
  });

  it("준비된 특약 문구 자체에는 무효 위험이 없다", () => {
    const i = input({ destination: "다낭, 베트남", includesFlights: true, tripScope: "overseas", specialTermOverrides: { prepaid: true } });
    expect(contractTermRisks(contractTerms(i, settings), settings)).toEqual([]);
  });

  it("무효가 될 수 있는 문구를 알린다", () => {
    expect(riskOf("현지 사고에 대해 당사는 일체 책임을 지지 않습니다.")).toContain("약관규제법");
    expect(riskOf("출발 14일 전부터는 환불 불가입니다.")).toContain("실제 손해");
    expect(riskOf("출발 3일 전 취소 시 요금의 80%를 위약금으로 배상합니다.")).toContain("80%");
    expect(riskOf("일정표를 받으면 특약에 동의한 것으로 봅니다.")).toContain("동의");
    expect(riskOf("여행사 고의·과실이 없는 항공 지연은 항공사 규정에 따릅니다.")).toBeNull();
    expect(contractTermRisks([], { ...settings, noShowFee: 500000 })[0]).toContain("노쇼");
  });

  it("입국 요건을 확인일과 함께", () => {
    expect(entryNotes("방콕")[0]).toMatchObject({ region: "thailand", checked: "2026-11" });
    expect(entryNotes("파리")[0].text).toContain("EES");
  });

  it("예전 회사 설정(특약 없음)도 기본값으로 읽는다", () => {
    expect(normalizeCompany({ name: "가나여행" }).specialTerms).toEqual(DEFAULT_SPECIAL_TERM_SETTINGS);
    expect(normalizeCompany({ specialTerms: { airCancelFee: -5, noShowFee: "x", disabled: ["a", 3] } }).specialTerms).toMatchObject({ airCancelFee: 0, noShowFee: 0, disabled: ["a"] });
  });
});
