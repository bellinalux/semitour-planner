import { describe, expect, it } from "vitest";
import { calculateQuote } from "@/lib/cost";
import { formatMoney } from "@/lib/currency";
import { supplierCuts, supplierTarget } from "@/lib/supplierCheck";
import { supplierRequestText, supplierWorkbook, type RequestContext } from "@/lib/supplierRequest";
import { verifySupplierQuote } from "@/lib/supplierVerify";
import type { SupplierQuote, TripInput } from "@/types";
import { input, item, linearDay } from "./fixtures";

const days = [linearDay(1, [item("a", { name: "바나힐", entryFee: 50000 })]), linearDay(2, [item("b", { name: "호이안", entryFee: 20000 })])];

const quoteOf = (patch: Partial<SupplierQuote> = {}): SupplierQuote => ({
  originalPrice: 400,
  originalCurrency: "USD",
  rate: 1400,
  pricePerPerson: 560000,
  basisTravelers: 4,
  roomBasis: "twin",
  singleSupplement: 168000,
  tiers: [],
  lines: [],
  includes: ["호텔", "차량", "가이드", "입장료"],
  excludes: ["가이드 팁"],
  shopping: "",
  options: "",
  notes: "",
  readAt: "",
  ...patch,
});

function ctxFor(patch: Partial<TripInput>): RequestContext {
  const i = input({
    pricingMode: "supplier",
    supplierPricePerPerson: 560000,
    travelers: 4,
    targetMarginRate: 15,
    cardFeeRate: 0,
    supplierQuote: quoteOf(),
    ...patch,
  });
  const q = calculateQuote(i, days, {});
  if (!q.ok) throw new Error(q.error);
  const target = supplierTarget(i, q, null);
  const cuts = target ? supplierCuts(i, days, {}, null, target.over).filter((c) => c.recommended) : [];
  const meta = { packageName: "다낭 3일", cities: [], noShopping: false, noOption: false, hotelGrade: "", highlights: [] };
  return {
    input: i,
    meta,
    target,
    cuts: target && target.over > 0 ? cuts : [],
    verify: verifySupplierQuote(i, days, {}, q),
    money: (v) => formatMoney(Math.round(v), "KRW"),
  };
}

describe("업체 수정 요청서", () => {
  it("상한을 넘으면 요청 공급가(견적 통화 함께)·일정 조정·질문을 묶는다", () => {
    const text = supplierRequestText(ctxFor({ supplierTargetPrice: 600000 })); // 상한 510,000 → 50,000 초과
    expect(text).toContain("[견적 확인 요청] 다낭 3일 · 4명");
    expect(text).toContain("(받은 견적: 1인 400 USD, 4명 기준, 2인 1실)");
    expect(text).toContain("- 1인 ₩510,000 (약 364 USD) 이하 (2인 1실 기준)로 맞춰 주실 수 있을까요?");
    expect(text).toContain("- DAY 1 바나힐 제외");
    expect(text).toContain("■ 확인 부탁드립니다");
    expect(text).toContain("가이드·기사 팁(경비)은 1인 얼마이고, 고객이 현지에서 내는 건가요?");
  });

  it("상한 안이면 공급가·일정 조정 요청 없이 질문만", () => {
    const text = supplierRequestText(ctxFor({ supplierTargetPrice: 800000 }));
    expect(text).not.toContain("■ 요청 공급가");
    expect(text).not.toContain("■ 일정 조정");
    expect(text).toContain("■ 확인 부탁드립니다");
  });

  it("검증표 엑셀: 요약·시세 비교·포함/불포함·일정 조정·질문 시트", () => {
    const sheets = supplierWorkbook(ctxFor({ supplierTargetPrice: 600000 }));
    expect(sheets.map((s) => s.name)).toEqual(["요약", "시세 비교", "포함·불포함", "일정 조정", "질문"]);
    const summary = sheets[0].rows;
    expect(summary).toContainEqual(["업체 공급가 상한", 510000]);
    expect(summary).toContainEqual(["받은 견적 1인", 400, "USD"]);
    expect(sheets[1].rows[0]).toEqual(["항목 (1인)", "업체", "우리 시세", "판정", "설명"]);
    expect(sheets[3].rows[1]).toEqual(["DAY 1 바나힐 제외", 50000, "유료 일정"]);
  });
});
