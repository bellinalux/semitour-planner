import { describe, expect, it } from "vitest";
import { continuousDriving } from "@/lib/driverHours";
import { item, linearDay } from "./fixtures";

describe("기사 연속 운전", () => {
  it("4시간 넘게 쉬지 않고(30분 미만 정차) 운전하면 알린다", () => {
    const d = linearDay(1, [
      item("a", { name: "다낭 호텔", stayMinutes: 0, travelMinutesToNext: 150 }),
      item("b", { name: "휴게소", stayMinutes: 10, travelMinutesToNext: 120 }),
      item("c", { name: "후에 왕궁", stayMinutes: 90 }),
    ]);
    expect(continuousDriving(d, {})).toEqual([{ minutes: 270, from: "다낭 호텔", to: "후에 왕궁" }]);
  });

  it("15분씩 두 번(합 30분) 쉬거나 관광으로 30분 이상 머물면 다시 센다, 비행은 운전이 아니다", () => {
    const d = linearDay(1, [
      item("a", { name: "A", stayMinutes: 0, travelMinutesToNext: 120 }),
      item("b", { name: "B 휴게", stayMinutes: 15, travelMinutesToNext: 60 }),
      item("c", { name: "C 휴게", stayMinutes: 15, travelMinutesToNext: 120 }),
      item("d", { name: "D", stayMinutes: 60, travelMinutesToNext: 30 }),
      item("f", { type: "flight", name: "출발", stayMinutes: 0, travelMinutesToNext: 300 }),
      item("g", { type: "flight", name: "도착", stayMinutes: 0 }),
    ]);
    expect(continuousDriving(d, {})).toEqual([]);
  });
});
