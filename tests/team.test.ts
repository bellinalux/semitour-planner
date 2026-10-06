import { describe, expect, it } from "vitest";
import { parseBackup } from "@/lib/backup";
import { calculateQuote } from "@/lib/cost";
import { addToLog, buildQuoteLogEntry, isQuoteLogEntry } from "@/lib/quoteLog";
import { mergeTeamData } from "@/lib/teamSync";
import { input, item, linearDay } from "./fixtures";

describe("팀 공용 데이터 합치기", () => {
  it("회사 기본값: 더 최근에 저장한 쪽을 쓴다", () => {
    const older = { savedAt: "2026-10-01T00:00:00Z", values: { targetMarginRate: 15 } };
    const newer = { savedAt: "2026-10-05T00:00:00Z", values: { targetMarginRate: 22 } };
    expect(mergeTeamData("defaults", older, newer)).toEqual({ merged: newer, pushBack: false });
    expect(mergeTeamData("defaults", newer, older)).toEqual({ merged: newer, pushBack: true });
    expect(mergeTeamData("defaults", newer, null)).toEqual({ merged: newer, pushBack: true });
  });

  it("원가 기억: 여행지별로 더 최근 값을 고르고, 브라우저에만 있던 여행지는 서버에 올린다", () => {
    const local = { 다낭: { savedAt: "2026-10-05" }, 방콕: { savedAt: "2026-09-01" } };
    const server = { 다낭: { savedAt: "2026-10-01" }, 세부: { savedAt: "2026-10-02" } };
    const { merged, pushBack } = mergeTeamData("cost-memory", local, server);
    expect(merged).toEqual({ 다낭: { savedAt: "2026-10-05" }, 방콕: { savedAt: "2026-09-01" }, 세부: { savedAt: "2026-10-02" } });
    expect(pushBack).toBe(true);
    expect(mergeTeamData("cost-memory", {}, server).pushBack).toBe(false);
  });
});

describe("견적 이력", () => {
  const i = input({ documentChannelId: "c1", channels: [{ id: "c1", name: "클룩", commissionRate: 20, fixedFeePerPerson: 0, paymentFeeSeparate: false, share: 0 }] });
  const q = calculateQuote(i, [linearDay(1, [item("a", { entryFee: 10000 }), item("m", { type: "meal", mealCost: 20000 })])], {});
  if (!q.ok) throw new Error(q.error);

  it("고객 문서용 가격(선택 채널)과 직판 마진을 남긴다", () => {
    const customer = { ...q, scenario: { ...q.scenario, pricePerPerson: 113000, totalPrice: 452000 } };
    const e = buildQuoteLogEntry(i, customer, q, "print", "견적서", " 김세미 ");
    expect(e).toMatchObject({ author: "김세미", channel: "클룩", pricePerPerson: 113000, document: "견적서", destination: "다낭" });
    expect(isQuoteLogEntry(e)).toBe(true);
  });

  it("1분 안에 같은 견적으로 여러 문서를 뽑으면 한 줄로 합친다", () => {
    const a = buildQuoteLogEntry(i, q, q, "print", "견적서", "김");
    const b = { ...buildQuoteLogEntry(i, q, q, "print", "계약서", "김"), at: new Date(Date.parse(a.at) + 5000).toISOString() };
    const list = addToLog(addToLog([], a), b);
    expect(list).toHaveLength(1);
    expect(list[0].document).toBe("견적서, 계약서");
    expect(list[0].id).toBe(a.id);
  });
});

describe("백업 파일", () => {
  it("세미투어 키만 되살린다", () => {
    const parsed = parseBackup(JSON.stringify({ app: "semitour-planner", version: 1, exportedAt: "x", data: { "semitour-planner:input:v1": "{}", other: "x", "semitour-planner:bad": 3 } }));
    expect(typeof parsed === "string" ? parsed : Object.keys(parsed.data)).toEqual(["semitour-planner:input:v1"]);
  });
  it("다른 파일은 거절", () => {
    expect(parseBackup("{}")).toBe("세미투어 백업 파일이 아닙니다.");
    expect(parseBackup("not json")).toBe("백업 파일 형식이 아닙니다.");
  });
});
