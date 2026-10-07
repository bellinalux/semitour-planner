import { describe, expect, it, vi } from "vitest";

// p11이 든 묶음만 시간 초과로 실패하는 상황
vi.mock("@/lib/server/gemini", () => ({
  generateGroundedText: vi.fn(async ({ user }: { user: string }) => {
    if (user.includes("[p11]")) throw new Error("TIMEOUT");
    return { text: user, searched: true, sources: [{ title: "공식", url: `https://x/${user.length}` }] };
  }),
  generateJson: vi.fn(async ({ user }: { user: string }) => {
    const ids = /요청 항목 ID: (.*)/.exec(user)![1].split(", ");
    return {
      results: ids.map((id) => ({ id, status: "confirmed", localCurrency: "KRW", localAmount: 10000, sourceName: "공식", note: "", recommendedStayMinutes: 55, shouldBeMeal: false })),
    };
  }),
}));
vi.mock("@/lib/server/fx", () => ({ krwPerUnit: vi.fn(async () => null) }));

const { verifyFees } = await import("@/lib/server/feeVerify");

describe("입장료 확인 — 묶음으로 나눠 조사", () => {
  const items = Array.from({ length: 25 }, (_, i) => ({ id: `p${i + 1}`, name: `장소${i + 1}` }));

  it("한 묶음이 실패해도 나머지 결과는 살리고, 실패한 항목만 '확인 못함'", async () => {
    const r = await verifyFees({ destination: "서울", currency: "KRW", exchangeRateToKrw: 0, items });
    const byId = new Map(r.results.map((x) => [x.id, x]));
    expect(byId.get("p1")).toMatchObject({ status: "confirmed", amountInQuote: 10000, recommendedStayMinutes: 60 });
    expect(byId.get("p15")).toMatchObject({ status: "unverified" });
    expect(byId.get("p15")?.note).toContain("응답이 늦어");
    expect(byId.get("p25")?.status).toBe("confirmed");
    expect(r.searched).toBe(true);
  });

  it("모든 묶음이 실패하면 오류를 그대로 알린다", async () => {
    await expect(verifyFees({ destination: "서울", currency: "KRW", exchangeRateToKrw: 0, items: items.slice(10, 16) })).rejects.toThrow("TIMEOUT");
  });
});
