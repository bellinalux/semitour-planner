import { describe, expect, it } from "vitest";
import { calcDayGap } from "@/lib/dayLoad";
import { suggestDayMoves } from "@/lib/dayBalance";
import { afternoonFree, fullFree, heavyReasons, lateStart, paceIssues } from "@/lib/pace";
import { DAY_STYLES, itineraryResponseSchema, toDayPlans } from "@/lib/schemas/itinerary";
import { buildItineraryUserPrompt, itineraryStructureSystemPrompt } from "@/lib/server/itineraryPrompt";
import { item, linearDay } from "./fixtures";

const sight = (id: string, stay = 60, travel = 15) => item(id, { stayMinutes: stay, travelMinutesToNext: travel });
const lunch = (id: string) => item(id, { type: "meal", name: "점심", stayMinutes: 60, travelMinutesToNext: 15 });

describe("힘든 날", () => {
  it("관광 9시간·장거리 이동·이른 출발을 찾는다", () => {
    expect(heavyReasons(linearDay(2, [sight("a", 300), lunch("l"), sight("b", 200)]), {})).toEqual([expect.stringMatching(/^관광 \d+시간/)]);
    expect(heavyReasons(linearDay(2, [sight("a", 60, 150), sight("b")]), {})[0]).toBe("한 번에 2시간 30분 이동");
    expect(heavyReasons(linearDay(2, [sight("a")], { meetingTime: "06:30" }), {})).toContain("06:30 이른 출발");
    expect(heavyReasons(linearDay(2, [sight("a")]), {})).toEqual([]);
  });
});

describe("다음 날 가볍게", () => {
  const days = () => [
    linearDay(1, [sight("a", 300), lunch("l1"), sight("b", 200)]),
    linearDay(2, [sight("c"), lunch("l2"), sight("d", 90), sight("e", 60)]),
    linearDay(3, [sight("f")]),
    linearDay(4, [sight("g")]),
  ];

  it("늦은 출발은 10:00 미팅과 쉬는 날 표시", () => {
    const d = lateStart(days(), 2)[1];
    expect(d).toMatchObject({ meetingTime: "10:00", rest: "late" });
  });

  it("오후 자유: 점심 뒤 관광을 여유 있는 날로 옮기고 오후 자유시간을 둔다", () => {
    const next = afternoonFree(days(), 2, {})!;
    // 점심 앞 식사 맞춤 자유시간은 그대로 두고, 점심 뒤는 오후 자유시간만
    const ids = next[1].items.map((i) => i.id);
    expect(ids.slice(ids.indexOf("l2"))).toEqual(["l2", "pmfree-2"]);
    expect(ids).not.toContain("d");
    expect(next[1].rest).toBe("pmfree");
    const moved = next.flatMap((d) => d.items.map((i) => i.id));
    expect(moved).toContain("d");
    expect(moved).toContain("e");
  });

  it("점검: 힘든 날 다음 날이 일찍 시작하면 제안", () => {
    const issues = paceIssues(days(), {}, "normal");
    expect(issues[0].text).toContain("DAY 1이(가) 힘든 날");
    expect(issues[0].fixes.map((f) => f.kind)).toEqual(["late", "pmfree"]);
    // 고친 뒤에는 그 문제가 없다
    expect(paceIssues(issues[0].fixes[0].days!, {}, "normal").filter((i) => i.day === 1)).toEqual([]);
  });

  it("5일 이상 쉬는 날이 없으면 전일 자유 제안 (알참은 빼고)", () => {
    const five = [1, 2, 3, 4, 5].map((n) => linearDay(n, [sight(`s${n}`), lunch(`l${n}`), sight(`t${n}`)]));
    const issue = paceIssues(five, {}, "relaxed").find((i) => i.day === 0)!;
    expect(issue.fixes[0].kind).toBe("free");
    const after = issue.fixes[0].days!;
    const freeDay = after.find((d) => d.rest === "free")!;
    expect(freeDay.items.map((i) => i.name)).toEqual(["전일 자유일정"]);
    expect(paceIssues(five, {}, "packed").find((i) => i.day === 0)).toBeUndefined();
    expect(fullFree(five, 3, {})).not.toBeNull();
  });

  it("쉬는 날은 빈 시간 채우기·날짜 옮기기가 다시 채우지 않는다", () => {
    const rest = linearDay(2, [sight("x", 30)], { rest: "pmfree" });
    expect(calcDayGap(rest, {}, false)).toBeNull();
    const long = linearDay(1, [sight("a", 400), lunch("l"), sight("b", 200), sight("c", 120)]);
    expect(suggestDayMoves([long, rest], {})).toEqual([]);
  });
});

describe("AI 일정 구성", () => {
  const raw = (style: (typeof DAY_STYLES)[number], extra: Record<string, unknown> = {}) => ({
    day: 1,
    theme: "t",
    overnightCity: "다낭",
    style,
    amGuided: [],
    pmFreeOptions: [],
    fullDay: [],
    freeNote: "",
    ...extra,
  });
  const it2 = (name: string, cuisine = "") => ({ name, description: "", stayMinutes: 60, travelMinutesToNext: 15, entryFee: 0, mealCost: 0, caution: "", cuisine });

  it("full·late·pmfree·free를 하루 순서 일정으로 바꾼다", () => {
    const parsed = itineraryResponseSchema.parse({
      days: [
        raw("full", { fullDay: [it2("a"), it2("점심", "현지식"), it2("b")] }),
        raw("late", { fullDay: [it2("c"), it2("d")] }),
        raw("pmfree", { fullDay: [it2("e"), it2("점심", "현지식")] }),
        raw("free", { freeNote: "스파·쇼핑 추천" }),
      ],
    });
    const days = toDayPlans(parsed, 4);
    expect(days.map((d) => [d.kind, d.rest ?? ""])).toEqual([
      ["linear", ""],
      ["linear", "late"],
      ["linear", "pmfree"],
      ["linear", "free"],
    ]);
    expect(days[1].meetingTime).toBe("13:00");
    expect(days[2].items.at(-1)?.name).toBe("오후 자유시간");
    expect(days[3].items[0]).toMatchObject({ type: "free_time", description: "스파·쇼핑 추천" });
  });

  it("프롬프트: 유형별 기본 구성·강도·동반자·꼭/피할 것", () => {
    expect(itineraryStructureSystemPrompt("package", "overseas")).toContain("[쉬는 날");
    const user = buildItineraryUserPrompt({
      destination: "다낭", days: 5, travelers: 4, currency: "KRW", themes: [], notes: "", travelType: "package", tripScope: "overseas", regionPlan: "", budgetNote: "",
      pace: "relaxed", companions: ["senior"], mustHave: "바나힐", avoid: "쇼핑센터",
    });
    expect(user).toContain("기본 하루 구성: full");
    expect(user).toContain("<pace_rule>여유");
    expect(user).toContain("부모님·시니어");
    expect(user).toContain("<must_have>바나힐</must_have>");
    expect(user).toContain("<avoid>쇼핑센터</avoid>");
  });
});
