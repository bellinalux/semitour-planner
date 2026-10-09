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

describe("업체 협상 근거", () => {
  it("상한을 넘으면 요청 공급가 아래에 시세 원가·타업체 판매가·더 싼 출발 요일 근거를 붙인다 (목표 판매가·수익은 넣지 않는다)", () => {
    const base = ctxFor({ supplierTargetPrice: 600000 });
    const caps = [
      { id: "a", name: "A투어", scopedPrice: 520000, maxSupplier: 0, breakEven: 0, estimatedCost: 440000, level: "high" as const },
      { id: "b", name: "B투어", scopedPrice: 600000, maxSupplier: 0, breakEven: 0, estimatedCost: 500000, level: "ok" as const },
    ];
    const q = base.input.supplierQuote!;
    const ctx = {
      ...base,
      caps,
      input: {
        ...base.input,
        nights: 2,
        supplierQuote: {
          ...q,
          datePrices: [
            { nights: 2, weekdays: [0, 1], label: "일, 월", pricePerPerson: 500000 },
            { nights: 2, weekdays: [5], label: "금", pricePerPerson: 560000 },
          ],
          picked: { price: 560000, label: "2박 금 출발 요금" },
        },
      },
    };
    const text = supplierRequestText(ctx);
    expect(text).toContain("■ 요청 근거");
    expect(text).toContain("같은 지역·기간 대형 여행사 상품 2개는 같은 조건(항공 제외 등)으로 1인 ₩520,000~₩600,000에 판매 중이라, 랜드 원가는 1인 약 ₩470,000 수준");
    expect(text).toContain("견적서의 일, 월 출발 요금(1인 ₩500,000 (약 357 USD))으로 맞춰 주실 수 있는지");
    expect(text).not.toContain("목표");
    expect(text).not.toContain("수익");
  });

  it("상한 안이어도 타업체 기준으로 높으면 '요금 조정 문의'로 제안 금액을 묻는다", () => {
    const base = ctxFor({ supplierTargetPrice: 800000 });
    const caps = [{ id: "a", name: "A투어", scopedPrice: 520000, maxSupplier: 0, breakEven: 0, estimatedCost: 440000, level: "high" as const }];
    const text = supplierRequestText({ ...base, caps });
    expect(text).toContain("■ 요금 조정 문의");
    expect(text).toContain("1인 ₩440,000 (약 314 USD) 정도로 조정이 가능할지");
  });
});

describe("협상 근거 — 다른 지역 포함 상품", () => {
  it("홍콩 등 다른 지역을 함께 도는 상품은 근거에서 뺀다", () => {
    const base = ctxFor({ supplierTargetPrice: 800000 });
    const caps = [{ id: "h", name: "하나투어 홍콩/다낭", scopedPrice: 300000, maxSupplier: 0, breakEven: 0, estimatedCost: 250000, level: "high" as const, extraRegions: ["홍콩"] }];
    expect(supplierRequestText({ ...base, caps })).not.toContain("대형 여행사 상품");
  });
});

describe("협상 근거 — 가벼운 일정 상품", () => {
  it("자유일이 우리보다 많은 상품은 원가 근거에서 빼고 참고로만 적는다", () => {
    const base = ctxFor({ supplierTargetPrice: 600000 });
    const light = {
      id: "a",
      name: "A투어 3박 4일 + 2일 자유",
      price: 600000,
      includes: { guide: true, meals: true, admission: true, vehicle: true, hotel: true, flight: false },
      shopping: "none" as const,
      optionTour: "none" as const,
      note: "",
      itinerary: {
        found: true,
        days: [1, 2, 3].map((d) => ({ day: d, title: "", places: [], meals: { breakfast: "", lunch: "", dinner: "" }, hotel: "", free: d > 1, otherRegion: "" })),
        mealCount: 1,
        tipNote: "",
        sourceName: "",
        checkedAt: "",
      },
    };
    const caps = [{ id: "a", name: light.name, scopedPrice: 400000, maxSupplier: 0, breakEven: 0, estimatedCost: 330000, level: "high" as const }];
    const text = supplierRequestText({ ...base, input: { ...base.input, competitors: [light] }, caps, ourFreeDays: 0 });
    expect(text).not.toContain("랜드 원가는");
    expect(text).toContain("(참고) 자유일정이 더 많은 가벼운 상품 1개는 같은 조건 1인 ₩400,000입니다");
  });
});
