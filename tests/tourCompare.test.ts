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
