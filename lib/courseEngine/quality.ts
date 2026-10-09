/**
 * 코스 품질 점수 (100점) — 전문가 검수 기준을 다섯 갈래로 채점하고, 고칠 방법을 제안한다.
 *  시간 맞음 30 · 동선 25 · 일정 밀도 15 · 체력 15 · 식사 15
 */
import { dayKey, fmt, hm, parseRange } from "./time";
import type { Audience, EngineOptions, EnginePlace, QualityFix, QualityItem, QualityReport, ScheduleResult } from "./types";

const PACE: Record<Audience, { maxStops: number; maxDay: number; maxWalkLeg: number }> = {
  any: { maxStops: 6, maxDay: 600, maxWalkLeg: 30 },
  couple: { maxStops: 6, maxDay: 600, maxWalkLeg: 30 },
  group: { maxStops: 6, maxDay: 600, maxWalkLeg: 25 },
  family: { maxStops: 5, maxDay: 540, maxWalkLeg: 20 },
  senior: { maxStops: 4, maxDay: 480, maxWalkLeg: 15 },
};

/**
 * current: 지금 코스를 그대로 흘려 본 결과, best: 엔진이 찾은 결과(있으면 '순서 바꾸기' 제안)
 */
export function scoreCourse(places: EnginePlace[], current: ScheduleResult, o: EngineOptions, best?: ScheduleResult): QualityReport {
  const aud = o.audience ?? "any", pace = PACE[aud];
  const items: QualityItem[] = [];
  const fixes: QualityFix[] = [];
  const tl = current.timeline;
  const byId = new Map(places.map(p => [p.id, p]));

  // 1) 시간 맞음
  const tIssues = current.violations.slice();
  const tScore = Math.max(0, 30 - tIssues.length * 10);
  items.push({ key: "time", label: "영업시간·예약·하루 끝", score: tScore, max: 30, issues: tIssues });

  // 2) 동선
  const dayLen = tl.length ? tl[tl.length - 1].end - tl[0].start : 0;
  const ratio = dayLen ? current.totalTravel / dayLen : 0;
  const rIssues: string[] = [];
  let rScore = 25;
  if (ratio > 0.3) { rScore -= Math.min(15, Math.round((ratio - 0.3) * 50)); rIssues.push(`이동이 일정의 ${Math.round(ratio * 100)}% — 30% 이하가 좋습니다`); }
  // 지그재그: 떠났던 구역으로 되돌아오면 한 번에 8점 (숙소·공항 복귀와 밤 일정은 괜찮다).
  // 엔진이 다른 순서로도 피하지 못한 되돌아옴은 이유(예약 시각·영업 시작·식사 시간대)를 붙이고 3점만 뺀다
  const zig = current.zigzag ?? [];
  // best가 없으면(엔진이 고른 결과 자체를 채점할 때) 그 결과의 되돌아옴이 곧 엔진도 피하지 못한 것
  const forced = new Set((best ?? current).zigzagIds ?? []);
  const reasonOf = (id: string): string => {
    const p = byId.get(id);
    if (!p) return "";
    if (p.fixedTime) return `예약 ${p.fixedTime} 고정`;
    const day = dayKey(o.weekday);
    const ranges = day && p.open ? parseRange(p.open[day]) : null;
    if (ranges?.length) return `영업 ${fmt(ranges[0][0])} 시작`;
    if (p.lastEntry) return `마지막 입장 ${p.lastEntry}`;
    if (p.kind === "meal" && p.meal !== "cafe") return `${p.meal === "dinner" ? "저녁" : "점심"} 시간대`;
    return "";
  };
  (current.zigzagIds ?? []).forEach((id, k) => {
    const why = forced.has(id) ? reasonOf(id) : "";
    if (why) { rScore -= 3; rIssues.push(`되돌아옴 — ${zig[k]} (불가피: ${why})`); }
    else { rScore -= 8; rIssues.push(`지그재그 이동 — ${zig[k]}`); }
  });
  if (current.homeFirst && o.homeRegion) {
    rScore -= 2;
    rIssues.push(`숙소 쪽(${o.homeRegion})을 먼저 돌고 먼 곳으로 갑니다 — 먼 곳 먼저, 숙소 쪽은 하루 끝이 좋습니다`);
  }
  if (best && best.order.join() !== current.order.join()) {
    const save = current.totalTravel - best.totalTravel;
    const solved = current.violations.length - best.violations.length;
    const unzig = zig.length - (best.zigzag ?? []).length;
    if (save >= 10 || solved > 0 || unzig > 0) {
      if (save >= 10) { rScore -= Math.min(10, Math.round(save / 6)); rIssues.push(`순서를 바꾸면 이동이 ${save}분 줄어듭니다`); }
      const why = [solved > 0 ? `시간 문제 ${solved}건 해결` : "", unzig > 0 ? "지그재그 없이 한 방향으로" : "", save >= 10 ? `이동 ${save}분 절약` : ""].filter(Boolean).join(", ");
      fixes.unshift({ type: "reorder", label: `엔진 추천 순서로 바꾸기 (${why})`, order: best.order });
    }
  }
  tl.forEach(s => { if (s.travelFromPrev >= 90) rIssues.push(`${s.name}까지 이동 ${s.travelFromPrev}분 — 먼 구간`); });
  items.push({ key: "route", label: "동선", score: Math.max(0, rScore), max: 25, issues: rIssues });

  // 3) 일정 밀도
  const sights = tl.filter(s => (byId.get(s.id)?.kind ?? "sight") === "sight");
  const dIssues: string[] = [];
  let dScore = 15;
  // 걸어서 함께 도는 구역(역사지구 등)은 명소 하나로 센다
  const stopCount = new Set(sights.map(s => byId.get(s.id)?.area || s.id)).size;
  if (stopCount > pace.maxStops) { dScore -= (stopCount - pace.maxStops) * 4; dIssues.push(`하루 명소 ${stopCount}곳 — ${aud === "senior" ? "시니어" : aud === "family" ? "가족" : "일반"} 기준 ${pace.maxStops}곳 이하 권장`); }
  // 구역 안 장소는 짧게 지나가는 것이 정상이라 "너무 짧음"으로 보지 않는다
  sights.forEach(s => { if (!byId.get(s.id)?.area && s.end - s.start < 20) { dScore -= 2; dIssues.push(`${s.name} 머무는 시간 ${s.end - s.start}분 — 너무 짧음`); } });
  if (sights.length <= 1 && tl.length > 1) dIssues.push("명소가 한 곳뿐입니다");
  items.push({ key: "density", label: "일정 밀도", score: Math.max(0, dScore), max: 15, issues: dIssues });

  // 4) 체력
  const sIssues: string[] = [];
  let sScore = 15;
  if (dayLen > pace.maxDay) { sScore -= Math.min(8, Math.round((dayLen - pace.maxDay) / 30)); sIssues.push(`하루 ${Math.floor(dayLen / 60)}시간 ${dayLen % 60}분 — ${Math.round(pace.maxDay / 60)}시간 이하 권장`); }
  if (o.mode === "walk") tl.forEach(s => { if (s.travelFromPrev > pace.maxWalkLeg) { sScore -= 2; sIssues.push(`${s.name}까지 걷기 ${s.travelFromPrev}분 — ${pace.maxWalkLeg}분 넘음`); } });
  // 쉬는 틈(식사·카페·자유 시간) 없이 4시간 넘게 이어지는지
  let run = 0, maxRun = 0;
  tl.forEach(s => { const k = byId.get(s.id)?.kind; if (k === "meal" || k === "free") run = 0; else { run += s.end - s.start + s.travelFromPrev; maxRun = Math.max(maxRun, run); } });
  if (maxRun > 240) { sScore -= 4; sIssues.push(`쉬는 시간 없이 ${Math.floor(maxRun / 60)}시간 넘게 이어집니다`); fixes.push({ type: "addBreak", label: "중간에 카페·자유 시간 30분 넣기" }); }
  items.push({ key: "stamina", label: "체력·속도", score: Math.max(0, sScore), max: 15, issues: sIssues });

  // 5) 식사
  const mIssues: string[] = [];
  let mScore = 15;
  const spansLunch = tl.length && tl[0].start <= 720 && tl[tl.length - 1].end >= 810;
  const meals = tl.filter(s => byId.get(s.id)?.kind === "meal" && byId.get(s.id)?.meal !== "cafe");
  const lunches = meals.filter(s => byId.get(s.id)?.meal !== "dinner");
  if (spansLunch && !lunches.length) { mScore -= 10; mIssues.push("점심 시간(12~14시)을 지나는데 식사 코스가 없습니다"); fixes.push({ type: "addMeal", label: "동선 위에 점심 식사 넣기" }); }
  meals.forEach(m => {
    const isDinner = byId.get(m.id)?.meal === "dinner";
    const to = isDinner ? hm(o.dinner?.to) ?? 1230 : hm(o.lunch?.to) ?? 840;
    if (m.start > to) { mScore -= 5; mIssues.push(`${isDinner ? "저녁" : "점심"} ${fmt(m.start)} — 늦음`); }
  });
  items.push({ key: "meal", label: "식사", score: Math.max(0, mScore), max: 15, issues: mIssues });

  if (current.dropped.length) current.dropped.forEach(d => fixes.push({ type: "drop", label: `${d.name} 빼기 (${d.reason})`, id: d.id }));
  // 하루가 늦게 끝나면 시작을 당기기
  const maxEnd = hm(o.maxEnd);
  if (maxEnd != null && current.endTime > maxEnd && tl.length && !o.fixedStart) {
    // 투어 시작은 08:00보다 당기지 않는다 (이미 08:00이면 당기기 대신 일정을 줄이거나 옮겨야 한다)
    const start = hm(o.start) ?? 540;
    const early = Math.max(480, start - (current.endTime - maxEnd));
    if (early < start) fixes.push({ type: "shiftStart", label: `출발을 ${fmt(early)}로 당기기`, start: fmt(early) });
  } else if (dayLen > pace.maxDay && tl.length && !o.fixedStart && (hm(o.start) ?? 540) < 600 && tl.some(s => byId.get(s.id)?.kind === "free" || s.wait > 0)) {
    // 이른 출발(예: 시각이 없어 08:00)로 하루가 길고 중간에 빈 시간(자유시간·대기)이 있으면 출발을 늦춰 하루를 줄인다 (최대 10:00)
    const start = hm(o.start) ?? 540;
    const late = Math.min(600, Math.ceil((start + dayLen - pace.maxDay) / 10) * 10);
    if (late > start) fixes.push({ type: "shiftStart", label: `출발을 ${fmt(late)}로 늦추기 (빈 시간을 줄여 하루를 짧게)`, start: fmt(late) });
  }

  const score = Math.max(0, Math.min(100, items.reduce((a, b) => a + b.score, 0)));
  const grade = score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : "D";
  return { score, grade, items, fixes };
}
