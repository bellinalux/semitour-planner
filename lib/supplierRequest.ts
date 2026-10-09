import type { CompetitorCap, SupplierCut, SupplierTarget } from "@/lib/supplierCheck";
import type { SupplierVerify } from "@/lib/supplierVerify";
import type { CourseMeta, TripInput } from "@/types";

/**
 * 업체 수정 요청서 — 업체(랜드사)에 보낼 문구(카톡·메일에 붙여넣기)와 검증 결과 엑셀.
 * 목표 공급가, 빼 달라고 할 일정, 확인할 질문을 한 번에 정리한다.
 */

export interface RequestContext {
  input: TripInput;
  meta: CourseMeta | null;
  target: SupplierTarget | null;
  /** 업체에 요청하기로 고른 일정 조정 */
  cuts: SupplierCut[];
  verify: SupplierVerify;
  money: (v: number) => string;
  /** 경쟁 상품별 공급가 기준 (내부용 엑셀에만) */
  caps?: CompetitorCap[];
}

/** 앱 통화 금액을 견적서 통화로도 함께 (예: ₩560,000 (약 400 USD)) */
function withOriginal(v: number, ctx: RequestContext): string {
  const q = ctx.input.supplierQuote;
  const base = ctx.money(v);
  if (!q || !q.rate || !q.originalCurrency || q.originalCurrency === ctx.input.currency) return base;
  return `${base} (약 ${Math.round(v / q.rate).toLocaleString("ko-KR")} ${q.originalCurrency})`;
}

/** 업체에 보내는 문구의 조정 표현 */
function cutText(c: SupplierCut): string {
  switch (c.kind) {
    case "meal-down":
      return `DAY ${c.dayNo} ${c.name} → 일반 식사로 변경`;
    case "ground-day":
      return `DAY ${c.dayNo} 차량·가이드 제외 (자유일정)`;
    case "hotel-down":
      return c.name;
    default:
      return `DAY ${c.dayNo} ${c.name} 제외`;
  }
}

export function supplierRequestText(ctx: RequestContext): string {
  const { input, meta, target, cuts, verify } = ctx;
  const title = meta?.packageName?.trim() || `${input.destination} ${input.nights}박 ${input.days}일`;
  const q = input.supplierQuote;
  const lines: string[] = [`[견적 확인 요청] ${title} · ${input.travelers}명`, "", "안녕하세요. 보내 주신 견적 잘 받았습니다."];
  if (q) {
    const basis = [q.basisTravelers > 0 ? `${q.basisTravelers}명 기준` : "", q.roomBasis === "twin" ? "2인 1실" : ""].filter(Boolean).join(", ");
    lines.push(`(받은 견적: 1인 ${q.originalPrice.toLocaleString("ko-KR")} ${q.originalCurrency || input.currency}${basis ? `, ${basis}` : ""})`);
  }
  lines.push("아래 내용 확인 부탁드립니다.");

  if (target && target.over > 0) {
    lines.push("", "■ 요청 공급가", `- 1인 ${withOriginal(target.maxSupplierPerPerson, ctx)} 이하 (2인 1실 기준)로 맞춰 주실 수 있을까요?`);
    lines.push(`  지금 견적 1인 ${withOriginal(target.supplierPerPerson, ctx)}보다 ${ctx.money(target.over)} 낮은 금액입니다.`);
    if (cuts.length > 0) {
      lines.push("", "■ 일정 조정 (금액을 맞추기 어려우면 아래를 빼거나 바꿔 주세요)");
      for (const c of cuts) lines.push(`- ${cutText(c)}`);
      lines.push("  조정했을 때 1인 공급가도 함께 알려 주세요.");
    }
  }

  if (verify.questions.length > 0) {
    lines.push("", "■ 확인 부탁드립니다");
    verify.questions.forEach((question, i) => lines.push(`${i + 1}. ${question}`));
  }
  lines.push("", "감사합니다.");
  return lines.join("\n");
}

const LEVEL_LABEL = { high: "높음", ok: "적정", low: "낮음", unknown: "모름" } as const;
const STATE_LABEL = { included: "포함", excluded: "불포함", missing: "안 적힘" } as const;

/** 검증 결과 엑셀 — 시트 이름과 표(행 배열) */
export function supplierWorkbook(ctx: RequestContext): { name: string; rows: (string | number)[][] }[] {
  const { input, target, cuts, verify } = ctx;
  const r = (v: number | null) => (v === null ? "" : Math.round(v));
  const q = input.supplierQuote;
  const sheets: { name: string; rows: (string | number)[][] }[] = [];

  const summary: (string | number)[][] = [
    ["업체 견적 검증 (내부용 — 목표 판매가·회사 수익이 들어 있어 업체에는 보내지 마세요. 업체에는 수정 요청 문구를 보내세요)"],
    [`${input.destination} ${input.nights}박 ${input.days}일 · ${input.travelers}명 · ${input.currency} · 1인 2인 1실 기준`],
    [],
  ];
  if (q) {
    summary.push(
      ["받은 견적 1인", q.originalPrice, q.originalCurrency],
      ["인원 기준", q.basisTravelers || "안 적힘"],
      ["객실 기준", { twin: "2인 1실", single: "1인 1실", triple: "3인 1실", unknown: "안 적힘" }[q.roomBasis]],
      ["싱글차지", q.singleSupplement || "안 적힘"],
      ["포함", q.includes.join(", ")],
      ["불포함", q.excludes.join(", ")],
      [],
    );
  }
  summary.push(["업체 공급가 1인", input.supplierPricePerPerson]);
  if (target) {
    summary.push(
      ["목표 판매가", target.targetPrice, target.targetSource === "competitors" ? "경쟁 상품 하위 25%" : "직접 입력"],
      [`수수료 (${target.channelName})`, -Math.round(target.feePerPerson)],
      [`회사 수익 (${Math.round(target.marginRate * 100)}%)`, -Math.round(target.profitPerPerson)],
      ["공급가 밖의 원가", -Math.round(target.otherPerPerson)],
      ["업체 공급가 상한", Math.round(target.maxSupplierPerPerson)],
      ["손익분기 공급가 (회사 수익 0)", Math.round(target.breakEvenSupplierPerPerson)],
      ["지금 공급가로 팔 때 회사 수익률 (%)", Math.round(target.marginAtCurrent * 10) / 10],
      ["상한과 차이 (+면 낮춰야 함)", Math.round(target.over)],
    );
  }
  sheets.push({ name: "요약", rows: summary });

  if (ctx.caps && ctx.caps.length > 0) {
    const level = { high: "경쟁사보다 비쌈", ok: "비슷", low: "경쟁사보다 쌈" } as const;
    sheets.push({
      name: "경쟁 상품별",
      rows: [
        [`경쟁사 수수료·마진 추정 ${input.competitorMarginRate}%`],
        ["경쟁 상품", "같은 조건 가격", "공급가 상한", "손익분기 공급가", "경쟁사 원가 추정", "우리 업체 견적"],
        ...ctx.caps.map((c) => [
          c.name,
          Math.round(c.scopedPrice),
          Math.round(c.maxSupplier),
          Math.round(c.breakEven),
          Math.round(c.estimatedCost),
          level[c.level],
        ]),
      ],
    });
  }
  sheets.push({
    name: "시세 비교",
    rows: [
      ["항목 (1인)", "업체", "우리 시세", "판정", "설명"],
      ...[...verify.rows, verify.total].map((row) => [row.label, r(row.supplier), r(row.market), LEVEL_LABEL[row.level], row.note]),
    ],
  });
  if (verify.checklist.length > 0) {
    sheets.push({ name: "포함·불포함", rows: [["항목", "상태", "견적서 문구"], ...verify.checklist.map((c) => [c.label, STATE_LABEL[c.state], c.evidence])] });
  }
  if (cuts.length > 0) {
    sheets.push({
      name: "일정 조정",
      rows: [["요청", "예상 절감 1인 (추정)", "이유"], ...cuts.map((c) => [cutText(c), Math.round(c.savingPerPerson), c.reason])],
    });
  }
  if (verify.questions.length > 0) {
    sheets.push({ name: "질문", rows: [["번호", "업체에 물어볼 것"], ...verify.questions.map((question, i) => [i + 1, question])] });
  }
  return sheets;
}
