import { describe, expect, it } from "vitest";
import { emptyCity, findPlace, mergeResearch, placeScore, type ResearchResult } from "@/lib/knowledge";
import { bumpMetrics, metricsRows } from "@/lib/knowledgeMetrics";
import { hotelLeadSuggestions, hotelPins, mapPoints, planRegions, regionRepeats } from "@/lib/regionPlan";
import { mergeTeamData } from "@/lib/teamSync";
import type { SelectedHotel } from "@/types";
import { item, linearDay } from "./fixtures";

describe("발전 지표", () => {
  it("달마다 더하고, 직원이 뺀 비율·점검 평균을 낸다", () => {
    const oct = new Date(2026, 9, 10);
    let r = bumpMetrics({}, { research: 1 }, oct);
    r = bumpMetrics(r, { reuse: 1 }, oct);
    r = bumpMetrics(r, { aiPlaces: 20 }, oct);
    r = bumpMetrics(r, { learned: 1, kind: "edits", removed: 3 }, oct);
    r = bumpMetrics(r, { score: 80 }, oct);
    r = bumpMetrics(r, { score: 90 }, oct);
    r = bumpMetrics(r, { score: 150 }, oct);
    const rows = metricsRows(r, 2, oct);
    expect(rows[0]).toMatchObject({ month: "2026-09", research: 0, removedRate: null, score: null });
    expect(rows[1]).toMatchObject({ month: "2026-10", research: 1, reuse: 1, learned: 1, removedRate: 15, score: 85 });
    expect(r["2026-10"].byKind).toEqual({ edits: 1 });
  });
});

describe("검수 대기", () => {
  it("웹 조사로 새로 들어온 곳은 검수 대기, 점수 −5", () => {
    const r: ResearchResult = { places: [{ name: "바나힐", area: "", kind: "sight", popularity: 50, agencies: [], fits: [], likes: [], dislikes: [], tips: [], stayMinutes: 60 }], courses: [], needs: [] };
    const d = mergeResearch(emptyCity("다낭"), r, []);
    const p = findPlace(d, "바나힐")!;
    expect(p.pending).toBe(true);
    expect(placeScore(p)).toBe(15);
    expect(placeScore({ ...p, pending: false })).toBe(20);
  });
});

describe("코스 조각 팀 공유", () => {
  const seg = (id: string, savedAt: string) => ({ id, savedAt, name: id });
  it("같은 조각은 더 최근 것, 지운 조각은 다른 쪽에서도 빠진다", () => {
    const local = { list: [seg("a", "2026-10-02"), seg("b", "2026-10-01")], deleted: { c: "2026-10-05" } };
    const server = { list: [seg("a", "2026-10-01"), seg("c", "2026-10-03"), seg("d", "2026-10-04")], deleted: {} };
    const { merged, pushBack } = mergeTeamData("segments", local, server) as { merged: { list: { id: string; savedAt: string }[]; deleted: Record<string, string> }; pushBack: boolean };
    expect(merged.list.map((x) => `${x.id}@${x.savedAt}`)).toEqual(["d@2026-10-04", "a@2026-10-02", "b@2026-10-01"]);
    expect(merged.deleted).toEqual({ c: "2026-10-05" });
    expect(pushBack).toBe(true);
    // 서버가 이미 같으면 다시 올리지 않는다
    expect(mergeTeamData("segments", merged, merged).pushBack).toBe(false);
  });
});

describe("숙소를 동선 기준으로", () => {
  const hotel = (name: string, lat?: number, lng?: number) => ({ name, grade: "", area: "", nearestStation: "", walkMinutes: 0, nightlyLow: 0, nightlyHigh: 0, priceBasis: "searched", mapUrl: "", ...(lat !== undefined ? { lat, lng } : {}) }) as SelectedHotel;
  const at = (id: string, lat: number, lng: number, patch = {}) => item(id, { name: id, lat, lng, travelMinutesToNext: 15, ...patch });
  const days = () => [
    linearDay(1, [at("한 시장", 16.068, 108.22), at("다낭 대성당", 16.061, 108.224)]),
    linearDay(2, [at("바나힐", 15.995, 107.996, { stayMinutes: 240 }), at("미케 비치", 16.06, 108.247)]),
    linearDay(3, [at("린응사", 16.1, 108.277), at("참 박물관", 16.06, 108.223)]),
  ];
  const pins = hotelPins({ 다낭: hotel("노보텔 다낭", 16.077, 108.223), 호이안: hotel("좌표 없음") });

  it("좌표 있는 숙소만, 전날 숙소에서 출발해 그날 숙소로", () => {
    expect(Object.keys(pins)).toEqual(["다낭"]);
    const pts = mapPoints(days(), {}, pins);
    expect(pts[0].map((p) => p.kind)).toEqual(["sight", "sight", "hotel"]);
    expect(pts[1].map((p) => p.name)).toEqual(["노보텔 다낭", "바나힐", "미케 비치", "노보텔 다낭"]);
    expect(pts[1][1].order).toBe(1);
  });

  it("숙소 동네(4km 안)는 반복 지역이 아니다", () => {
    expect(regionRepeats(days(), {}).length).toBeGreaterThan(0);
    expect(regionRepeats(days(), {}, pins).map((r) => r.region)).not.toContain("한 시장 주변");
    expect(planRegions(days(), {}, pins).withHotels).toBe(true);
  });

  it("숙소 → 첫 장소 이동이 일정표(30분)와 크게 다르면 제안", () => {
    const s = hotelLeadSuggestions(days(), {}, pins);
    expect(s[0]).toMatchObject({ day: 2, current: 30, hotel: "노보텔 다낭", first: "바나힐" });
    expect(s[0].minutes).toBeGreaterThanOrEqual(45);
    // 가까운 날(DAY 3 린응사 약 6km)은 더 짧게
    expect(s.find((x) => x.day === 3)?.minutes).toBeLessThanOrEqual(20);
  });
});
