import { describe, expect, it } from "vitest";
import { calculateQuote } from "@/lib/cost";
import { buildTourCompare, ourPlaces } from "@/lib/tourCompare";
import { samePlace } from "@/lib/places";
import type { Competitor, TripInput } from "@/types";
import { input, item, linearDay } from "./fixtures";

const days = [
  linearDay(1, [item("a", { name: "바나힐", entryFee: 50000 }), item("m", { name: "점심", type: "meal", mealCost: 20000 })]),
  linearDay(2, [item("b", { name: "호이안 올드타운" }), item("c", { name: "미케 비치" }), item("t", { name: "공항 이동", type: "transfer" })]),
];

const land = {
  guide: true,
  meals: true,
  admission: true,
  vehicle: true,
  hotel: false,
  flight: false,
};
const competitor = (patch: Partial<Competitor>): Competitor => ({
  id: "c",
  name: "A여행",
  price: 0,
  includes: land,
  shopping: "none",
  optionTour: "none",
  note: "",
  ...patch,
});

function compareFor(patch: Partial<TripInput>) {
  const i = input({ targetMarginRate: 20, ...patch });
  const q = calculateQuote(i, days, {});
  if (!q.ok) throw new Error(q.error);
  return { q, cmp: buildTourCompare(i, days, {}, q, null) };
}

describe("투어 비교표", () => {
  it("방문지 이름은 괄호·띄어쓰기를 무시하고 한쪽이 다른 쪽을 포함하면 같은 곳", () => {
    expect(samePlace("바나힐", "바나 힐 (골든브릿지)")).toBe(true);
    expect(samePlace("호이안 올드타운", "호이안")).toBe(true);
    expect(samePlace("미케 비치", "바나힐")).toBe(false);
    expect(ourPlaces(days, {})).toEqual(["바나힐", "호이안 올드타운", "미케 비치"]);
  });

  it("경쟁 상품이 없으면 비교표를 만들지 않는다", () => {
    expect(compareFor({ competitors: [] }).cmp).toBeNull();
  });

  it("겹치는 방문지·우리만의 방문지·가격 위치·판정", () => {
    const { q, cmp } = compareFor({
      competitors: [
        competitor({
          id: "x",
          name: "싼 상품",
          price: 1,
          places: ["바나힐 테마파크", "오행산"],
          shopping: "some",
        }),
        competitor({
          id: "y",
          name: "비싼 상품",
          price: 10_000_000,
          places: ["호이안"],
        }),
      ],
    });
    expect(cmp).not.toBeNull();
    const [ours, cheap, pricey] = cmp!.columns;
    expect(ours.price).toBe(q.scenario.pricePerPerson);
    expect(cheap.overlap).toEqual(["바나힐"]);
    expect(pricey.overlap).toEqual(["호이안 올드타운"]);
    expect(cmp!.onlyOurs).toEqual(["미케 비치"]);
    expect(cmp!.position).toContain("1개보다 비싸고 1개보다 저렴");
    const v = Object.fromEntries(cmp!.verdicts.map((x) => [x.id, x]));
    expect(v.x.text).toContain("비쌈");
    expect(v.x.text).toContain("쇼핑 없음");
    expect(v.x.tone).toBe("neutral"); // 비싸도 쇼핑이 없다는 강점이 있으면 판단 보류
    expect(v.y.tone).toBe("good");
    expect(v.y.text).toContain("방문지 1곳 겹침");
  });

  it("경쟁 가격을 모르면 위치를 말하지 않는다", () => {
    const { cmp } = compareFor({ competitors: [competitor({ price: 0 })] });
    expect(cmp!.position).toBe("경쟁 가격을 아직 모릅니다");
    expect(cmp!.verdicts[0].text).toContain("경쟁 가격 모름");
    expect(cmp!.onlyOurs).toEqual([]); // 경쟁 방문지를 모르면 '우리만'을 단정하지 않는다
  });

  it("호텔 등급을 비교한다", () => {
    const { cmp } = compareFor({
      packageType: "land_hotel",
      nights: 1,
      lodgingRatePerNight: 100000,
      hotelGrade: "5",
      competitors: [competitor({ price: 500000, hotelGrade: "4성급" })],
    });
    expect(cmp!.verdicts[0].text).toContain("호텔 등급 높음(5성 vs 4성)");
    expect(cmp!.columns[0].hotelGrade).toBe("5성급");
  });
});

describe("투어 비교 정리 — 우리가 나은 점 / 경쟁 상품이 나은 점", () => {
  it("경쟁 상품에만 있는 방문지, 여러 곳이 가는데 우리에게 없는 곳, 강점·약점을 몇 곳 대비인지와 함께", () => {
    const { cmp } = compareFor({
      competitors: [
        competitor({ id: "a", name: "A", price: 9_000_000, shopping: "some", places: ["바나힐", "오행산", "린응사"], highlight: "바나힐 케이블카 왕복" }),
        competitor({ id: "b", name: "B", price: 9_500_000, shopping: "some", places: ["오행산", "호이안"] }),
      ],
    });
    const a = cmp!.columns.find((c) => c.id === "a")!;
    expect(a.theirOnly).toEqual(["오행산", "린응사"]);
    expect(a.highlight).toBe("바나힐 케이블카 왕복");
    expect(cmp!.missingPopular[0]).toEqual({ name: "오행산", count: 2 });
    expect(cmp!.summary.strengths).toContain("노쇼핑 (2곳 모두 쇼핑 있음)");
    expect(cmp!.summary.strengths.some((s) => s.startsWith("가격: 2곳 모두보다 저렴"))).toBe(true);
    expect(cmp!.summary.strengths.some((s) => s.startsWith("경쟁 상품 소개에 없는 우리 방문지: 미케 비치"))).toBe(true);
    expect(cmp!.summary.weaknesses.some((s) => s.includes("오행산(2곳)"))).toBe(true);
  });
});

describe("투어 비교 — 상품 범위가 다른 경우", () => {
  it("다른 지역을 함께 도는 상품은 표시하고 강약 비교에서 뺀다", async () => {
    const { extraRegionsOf } = await import("@/lib/tourCompare");
    expect(extraRegionsOf("인터파크투어 [홍콩/마카오] 관광+자유 4일", "마카오")).toEqual(["홍콩"]);
    expect(extraRegionsOf("하나투어 마카오 4일 #노쇼핑", "마카오")).toEqual([]);
    expect(extraRegionsOf("다낭/호이안 5일", "다낭, 호이안")).toEqual([]);
    expect(extraRegionsOf("참좋은여행 [노쇼핑/마카오 3박 4일] 핵심관광", "마카오")).toEqual([]);
    expect(extraRegionsOf("[2030 크루투어] 홍콩 마카오 3박 4일 가족 여행", "마카오")).toEqual(["홍콩"]);
    expect(extraRegionsOf("모두투어 [시그니처] 마카오+홍콩 3박4일", "마카오")).toEqual(["홍콩"]);
  });

  it("항공 포함 상품은 항공료를 모르면 같은 조건 가격을 내지 않고, 항공 포함 여부는 약점이 아니라 범위 안내로", () => {
    const withAir = { ...land, flight: true };
    const { cmp } = compareFor({
      flightPricePerPerson: 0,
      competitors: [competitor({ id: "a", name: "A", price: 9_000_000, includes: withAir })],
    });
    expect(cmp!.columns[1].price).toBeNull();
    expect(cmp!.verdicts[0].text).toContain("항공료 시세가 있어야");
    expect(cmp!.summary.weaknesses.join()).not.toContain("항공");
    expect(cmp!.summary.scopeNotes.join()).toContain("항공료 시세가 없어 같은 조건 가격을 낼 수 없습니다");
    // 항공료를 알면 빼고 견준다
    const known = compareFor({ flightPricePerPerson: 400_000, competitors: [competitor({ id: "a", name: "A", price: 9_000_000, includes: withAir })] });
    expect(known.cmp!.columns[1].price).toBe(9_000_000 - 400_000);
    expect(known.cmp!.summary.scopeNotes.join()).toContain("항공 금액(1인 400,000)을 빼고 견줬습니다");
  });

  it("'베네시안 리조트'와 '베네시안 호텔 관광 및 카지노 체험'은 같은 곳", async () => {
    const { samePlace } = await import("@/lib/places");
    expect(samePlace("베네시안리조트", "베네시안 호텔 관광 및 카지노 체험")).toBe(true);
    expect(samePlace("마카오 타워", "마카오 에펠타워")).toBe(false);
  });
});

describe("투어 비교 — 다른 지역 포함 상품의 방문지", () => {
  it("홍콩 포함 상품에만 있는 곳(빅토리아 피크)은 '우리에겐 없는 곳'으로 세지 않는다", () => {
    const { cmp } = compareFor({
      destination: "다낭",
      competitors: [
        competitor({ id: "a", name: "A투어 홍콩/다낭 4일", price: 9_000_000, places: ["빅토리아 피크", "바나힐"] }),
        competitor({ id: "b", name: "B투어 다낭 4일", price: 9_000_000, places: ["오행산", "바나힐"] }),
      ],
    });
    expect(cmp!.missingPopular.map((p) => p.name)).toEqual(["오행산"]);
    expect(cmp!.columns.find((c) => c.id === "a")!.extraRegions).toEqual(["홍콩"]);
  });
});

describe("묶어 쓴 장소 이름", () => {
  it("'육포&쿠키거리'는 '육포거리'와 같은 곳", async () => {
    const { samePlace } = await import("@/lib/places");
    expect(samePlace("육포&쿠키거리", "육포거리")).toBe(true);
    expect(samePlace("육포&쿠키거리", "세나도 광장")).toBe(false);
  });
});
