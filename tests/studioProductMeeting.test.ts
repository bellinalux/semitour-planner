import { describe, expect, it } from "vitest";
import { meetingStarts, parseStudioProduct, productCourseText } from "@/lib/studioProduct";

const base = { schema: "studio-product" as const, version: 1, title: "야경 투어", days: [{ title: "", courses: [{ name: "광장" }] }] };

describe("상세페이지 상품 — 오전·오후·야경 출발 시간 받기", () => {
  it("times가 오면 출발 시간을 나눠 읽고, 일정은 첫 출발 기준", () => {
    const p = parseStudioProduct({ ...base, meeting: { time: "오전 투어 09:00 · 야경 투어 19:30", times: { am: "09:00", pm: "", night: "19:30" }, place: "역 앞" } })!;
    expect(meetingStarts(p).map((x) => x.time)).toEqual(["09:00", "19:30"]);
    const t = productCourseText(p);
    expect(t).toContain("미팅: 09:00 역 앞");
    expect(t).toContain("출발 시간: 오전 투어 09:00 · 야경 투어 19:30");
  });
  it("times가 없어도 합친 한 줄에서 찾는다", () => {
    const p = parseStudioProduct({ ...base, meeting: { time: "오후 투어 14:00 · 야경 투어 19:30" } })!;
    expect(meetingStarts(p).map((x) => x.label)).toEqual(["오후 투어", "야경 투어"]);
  });
  it("예전처럼 시간 하나만 오면 그대로", () => {
    const p = parseStudioProduct({ ...base, meeting: { time: "08:30", place: "호텔" } })!;
    const t = productCourseText(p);
    expect(t).toContain("미팅: 08:30 호텔");
    expect(t).not.toContain("출발 시간:");
  });
});
