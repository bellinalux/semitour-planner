import { describe, expect, it } from "vitest";
import { airportPlan } from "@/lib/airportStandard";

describe("출국 공항 업계 기준", () => {
  it("국제선: 출발 3시간 전 도착, 탑승 수속 마감 60분 전, 탑승구 30분 전", () => {
    const p = airportPlan("19:50", "international");
    expect(p).toMatchObject({ arrive: "16:50", counterClose: "18:50", gateClose: "19:20", warning: "" });
    expect(p.text).toBe("공항 도착 16:50 (국제선 출발 3시간 전, 성수기 3시간 30분 전) · 탑승 수속 마감 18:50 · 탑승구 마감 19:20");
  });

  it("국내선: 1시간 전 도착, 마감 20분 전", () => {
    expect(airportPlan("10:00", "domestic")).toMatchObject({ arrive: "09:00", counterClose: "09:40", gateClose: "09:50" });
  });

  it("새벽 출발은 전날 밤 시각으로", () => {
    expect(airportPlan("01:30", "international").arrive).toBe("22:30");
  });

  it("출발 시각을 모르면 상대 표기", () => {
    const p = airportPlan(undefined, "international");
    expect(p.arrive).toBe("");
    expect(p.text).toContain("출발 3시간 전 공항 도착");
  });

  it("지금 일정으로 공항에 늦게 닿으면 경고 — 탑승 수속 마감까지 넘기면 더 세게", () => {
    expect(airportPlan("23:50", "international", "20:30").warning).toBe("");
    expect(airportPlan("23:50", "international", "22:00").warning).toContain("출발 1시간 50분 전입니다");
    expect(airportPlan("23:50", "international", "23:10").warning).toContain("탑승 수속 마감(60분 전)을 넘깁니다");
    // 자정 넘김: 23:00 도착, 01:30 출발 → 2시간 30분 전
    expect(airportPlan("01:30", "international", "23:00").warning).toContain("2시간 30분 전");
  });
});
