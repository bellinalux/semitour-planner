import { describe, expect, it } from "vitest";
import { cancelQuote, cancelSchedule, freeCancelDeadline, normalizeCancelPolicy, policyDisclosure, policyRisks, POLICY_PRESETS, STANDARD_POLICY } from "@/lib/cancelPolicy";
import { normalizeCompany } from "@/lib/company";

const major = POLICY_PRESETS.find((p) => p.id === "major")!.policy;
const DEP = "2027-01-04"; // 보내주신 예: 49일 전 = 2026.11.16, 39일 전 = 2026.11.26
const base = { departureDate: DEP, total: 2_000_000, deposit: 200_000, paid: 2_000_000, travelers: 2 };

describe("취소 규정 — 대형사 특별약관형 (보내주신 예시)", () => {
  it("구간마다 실제 날짜, 오늘(11.12) 구간, 무료 취소 마감(일요일 → 실제 금요일)", () => {
    const rows = cancelSchedule(major, DEP, "2026-11-12");
    expect(rows.map((r) => [r.range, r.from, r.to, r.charge])).toEqual([
      ["출발 50일 전까지", null, "2026-11-15", "전액 환불 (위약금 없음)"],
      ["출발 49일 ~ 40일 전", "2026-11-16", "2026-11-25", "예약금(계약금) 환불 불가"],
      ["출발 39일 ~ 21일 전", "2026-11-26", "2026-12-14", "여행요금의 70%"],
      ["출발 20일 ~ 당일", "2026-12-15", "2027-01-04", "환불 불가 (여행요금 100%)"],
    ]);
    expect(rows[0].current).toBe(true);
    expect(freeCancelDeadline(rows)).toEqual({ date: "2026-11-15", deadline: "2026-11-13" });
  });

  it("취소료 계산: 영업일·업무 종료 시각 기준", () => {
    // 금요일 17시 통보 → 52일 전 → 무료
    expect(cancelQuote(major, { ...base, noticeDate: "2026-11-13", noticeTime: "17:00" })).toMatchObject({ daysBefore: 52, fee: 0, refund: 2_000_000 });
    // 금요일 19시(업무 종료 뒤) → 월요일 11.16 접수 → 49일 전 → 예약금 20만원
    expect(cancelQuote(major, { ...base, noticeDate: "2026-11-13", noticeTime: "19:00" })).toMatchObject({ noticeDate: "2026-11-16", daysBefore: 49, fee: 200_000 });
    // 일요일(무료 마감일로 표시된 날) 통보 → 월요일 접수 → 예약금
    expect(cancelQuote(major, { ...base, noticeDate: "2026-11-15", noticeTime: "10:00" })).toMatchObject({ noticeDate: "2026-11-16", fee: 200_000 });
    // 11.30 → 70%
    expect(cancelQuote(major, { ...base, noticeDate: "2026-11-30", noticeTime: "10:00" })?.fee).toBe(1_400_000);
    // 발권 뒤 항공 수수료 1인 13만원 더함, 받은 돈 계약금뿐이면 추가 청구
    const q = cancelQuote(major, { ...base, paid: 200_000, noticeDate: "2026-12-01", noticeTime: "10:00", ticketed: true, airFeePerPerson: 130_000 })!;
    expect(q.fee).toBe(1_400_000 + 260_000);
    expect(q.owed).toBe(1_460_000);
  });

  it("공휴일도 영업일에서 뺀다", () => {
    const holidays = new Set(["2026-11-16"]);
    expect(cancelQuote(major, { ...base, noticeDate: "2026-11-15", noticeTime: "10:00", holidays })?.noticeDate).toBe("2026-11-17");
  });

  it("위험 점검: 50% 넘는 구간, 사유 없음, 무료 마감이 휴일", () => {
    const risks = policyRisks({ ...major, reason: "" }, { departureDate: DEP, perPerson: 1_000_000 });
    expect(risks.join("\n")).toContain("사유");
    expect(risks.join("\n")).toContain("50%를 넘는 구간");
    expect(risks.join("\n")).toContain("실제 마감은 2026.11.13(금)");
    expect(policyRisks(STANDARD_POLICY, { departureDate: DEP })).toEqual([]);
    expect(policyRisks({ ...major, guaranteeNote: "호텔 확정", guaranteeFee: 0 }).join("\n")).toContain("개런티");
  });

  it("특별약관 고지에 근거 제시·실제 손해 초과분 환급·영업일 기준이 들어간다", () => {
    const text = policyDisclosure(major).join("\n");
    expect(text).toContain("산정 근거");
    expect(text).toContain("실제 손해보다 많이 받은 금액은 돌려드립니다");
    expect(text).toContain("영업일");
  });
});

describe("표준약관·저장값", () => {
  it("표준약관 계산 (8일 전 20%, 당일 50%)", () => {
    expect(cancelQuote(STANDARD_POLICY, { ...base, noticeDate: "2026-12-27" })?.fee).toBe(400_000);
    expect(cancelQuote(STANDARD_POLICY, { ...base, noticeDate: DEP })?.fee).toBe(1_000_000);
  });
  it("예전 회사 설정은 표준약관, 이상한 값은 걸러낸다", () => {
    expect(normalizeCompany({}).cancelPolicy).toEqual(STANDARD_POLICY);
    const p = normalizeCancelPolicy({ mode: "custom", tiers: [{ daysBefore: 10, kind: "percent", value: 30 }, { daysBefore: 40, kind: "refund", value: 0 }, { daysBefore: 5, kind: "bad" }] });
    expect(p.tiers.map((t) => t.daysBefore)).toEqual([40, 10]);
    expect(normalizeCancelPolicy({ mode: "custom", tiers: [] }).mode).toBe("standard");
  });
});
