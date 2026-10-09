import { describe, expect, it } from "vitest";
import { dayMeetingTime, walkTimeline } from "@/lib/dayLoad";
import { flightMismatches, knownFlight, repairFlightTimes } from "@/lib/flightRepair";
import { input, item, linearDay } from "./fixtures";

// 이미 만들어진(잘못된) 일정: 도착 항목 하나가 09:50 출발 시각에 놓이고 비행 20분
const broken = () => [
  linearDay(
    1,
    [
      item("arr", {
        type: "flight",
        name: "마카오 공항 도착 ( 12:50 ), 가이드 미팅",
        description: "제주항공 (09:50 ~ 12:50) 이용 마카오 공항 도착 후 가이드 미팅",
        stayMinutes: 40,
        travelMinutesToNext: 20,
      }),
      // 예전 시각(09:50 시작, 20분 비행) 기준으로 끼워 넣었던 "식사 시간에 맞춘 자유시간"
      item("lunch-free-0", {
        type: "free_time",
        name: "자유시간",
        description: "다음 식사 시간에 맞춰 비워 둔 자유시간입니다.",
        stayMinutes: 150,
        travelMinutesToNext: 0,
      }),
      item("lunch", { type: "meal", name: "점심 식사 (굴국수)", stayMinutes: 50 }),
    ],
    { meetingTime: "09:50" },
  ),
  linearDay(2, [item("s", { name: "콜로안 빌리지", stayMinutes: 60 })]),
];

const starts = (day: ReturnType<typeof broken>[number]) =>
  walkTimeline(day.items, dayMeetingTime(day)).map((s) => `${String(Math.floor(s.start / 60)).padStart(2, "0")}:${String(s.start % 60).padStart(2, "0")}`);

describe("이미 만든 일정표의 항공 시각 바로잡기", () => {
  it("비행 항목 글의 '09:50 ~ 12:50'으로 어긋난 곳을 찾아 알려 준다", () => {
    const days = broken();
    const flight = knownFlight(days, { selectedFlight: null }, null);
    expect(flight).toMatchObject({ departTime: "09:50", arriveTime: "12:50" });
    expect(flightMismatches(days, flight)[0]).toContain("12:50 도착이 09:50에 표시됩니다");
  });

  it("다시 코스 분석을 하지 않아도 출발 09:50 → 도착 12:50으로 맞추고, 예전 시각 기준 자유시간은 빼서 점심이 도착 뒤에 바로 오게 한다", () => {
    const fixed = repairFlightTimes(broken(), { selectedFlight: null }, null)!;
    expect(fixed).not.toBeNull();
    expect(fixed[0].items.map((i) => i.name)).toEqual(["항공 출발", "마카오 공항 도착 ( 12:50 ), 가이드 미팅", "점심 식사 (굴국수)"]);
    expect(starts(fixed[0])).toEqual(["09:50", "12:50", "13:50"]); // 도착 12:50 + 미팅 40분 + 이동 20분
    expect(repairFlightTimes(fixed, { selectedFlight: null }, null)).toBeNull();
  });

  it("코스 분석 때 읽어 둔 항공편(meta.flight)이 있으면 그것으로, 확인된 시각이 없으면 건드리지 않는다", () => {
    const days = [
      linearDay(1, [item("dep", { type: "flight", name: "인천 출발", travelMinutesToNext: 40 }), item("arr", { type: "flight", name: "다낭 도착" })]),
    ];
    const meta = { flight: { ...knownFlight(broken(), { selectedFlight: null }, null)!, departTime: "10:00", arriveTime: "12:40" } };
    const fixed = repairFlightTimes(days, { selectedFlight: null }, meta)!;
    expect(starts(fixed[0])).toEqual(["10:00", "12:40"]);
    expect(repairFlightTimes(days, input({ selectedFlight: null }), null)).toBeNull();
  });
});

describe("저장된 일정에서 공항 도착이 관광으로 분류돼 있어도", () => {
  it("중복 도착 항목을 만들지 않고 그 항목을 12:50 도착으로 맞춘다", () => {
    const days = [
      linearDay(
        1,
        [
          item("dep", { type: "flight", name: "인천 국제공항 출발", stayMinutes: 0, travelMinutesToNext: 20 }),
          item("arr", {
            type: "sightseeing",
            name: "마카오 공항 도착, 가이드 미팅",
            description: "제주항공 (09:50 ~ 12:50)",
            stayMinutes: 40,
            travelMinutesToNext: 20,
          }),
          item("s1", { name: "탑석광장", stayMinutes: 30 }),
        ],
        { meetingTime: "09:50" },
      ),
      linearDay(2, [item("s", { name: "콜로안 빌리지" })]),
    ];
    const fixed = repairFlightTimes(days, { selectedFlight: null }, null)!;
    expect(fixed[0].items.map((i) => i.id)).toEqual(["dep", "arr", "s1"]);
    expect(starts(fixed[0]).slice(0, 2)).toEqual(["09:50", "12:50"]);
  });
});
