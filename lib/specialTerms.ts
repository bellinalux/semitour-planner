/**
 * 여행계약서 특약(국외여행 표준약관 제6조) — 대형 여행사 상품 약관에서 흔히 쓰는 특약을 공통·국가별로 모았다.
 *  - 여행지로 국가·지역을 알아내 넣을 만한 특약을 추천하고, 상품마다 켜고 끌 수 있다.
 *  - 금액(항공 취소 수수료·노쇼 위약금 등)은 회사 설정에서 정한다.
 *  - 특약은 약관규제법·표준약관의 한계 안에서만 유효하다 — 전부 면책, 실제 손해를 넘는 위약금, 설명·동의 없는 특약은
 *    분쟁 때 무효가 될 수 있어 riskOf로 미리 알린다. 실제 계약에 쓰기 전 법률 검토를 권한다.
 *
 * 근거: 국외여행 표준약관(공정위 제10021호) 제6조·제12조·제15조·제16조, 공정위 취소수수료 시정(2011·2014),
 * 한국소비자원 분쟁조정(특별약관 위약금 80% → 30% 조정), 대형사(모두투어 등) 상품 약관의 특별약관 조항.
 */
import { formatMoney } from "@/lib/currency";
import { zoneOf } from "@/lib/timezone";
import type { CurrencyCode, SpecialTermSettings, TripInput } from "@/types";

export type TermRegion = "japan" | "china" | "vietnam" | "thailand" | "philippines" | "sea" | "usa" | "uk" | "europe" | "oceania";

export const REGION_LABEL: Record<TermRegion, string> = {
  japan: "일본",
  china: "중국",
  vietnam: "베트남",
  thailand: "태국",
  philippines: "필리핀",
  sea: "동남아",
  usa: "미국·캐나다·괌·사이판",
  uk: "영국",
  europe: "유럽",
  oceania: "호주·뉴질랜드",
};

export type { SpecialTermSettings };

export const DEFAULT_SPECIAL_TERM_SETTINGS: SpecialTermSettings = { airCancelFee: 0, noShowFee: 0, businessHours: "", custom: "", disabled: [] };

export function normalizeSpecialTermSettings(v: unknown): SpecialTermSettings {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return DEFAULT_SPECIAL_TERM_SETTINGS;
  const o = v as Partial<SpecialTermSettings>;
  const money = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? Math.min(10_000_000, Math.max(0, Math.round(x))) : 0);
  return {
    airCancelFee: money(o.airCancelFee),
    noShowFee: money(o.noShowFee),
    businessHours: typeof o.businessHours === "string" ? o.businessHours.slice(0, 60) : "",
    custom: typeof o.custom === "string" ? o.custom.slice(0, 2000) : "",
    disabled: Array.isArray(o.disabled) ? o.disabled.filter((x): x is string => typeof x === "string").slice(0, 60) : [],
  };
}

interface TermContext {
  input: Pick<TripInput, "includesFlights" | "tripScope" | "currency" | "packageType">;
  settings: SpecialTermSettings;
}

export interface SpecialTerm {
  id: string;
  /** 묶음 — 공통이면 null, 국가별이면 지역 */
  region: TermRegion | null;
  title: string;
  /** 계약서에 들어가는 문구 */
  text: (ctx: TermContext) => string;
  /** 표준약관과 다른 점 (계약서의 설명 칸) */
  differs: string;
  /** 이 상품에 기본으로 넣는가 */
  recommended: (ctx: TermContext) => boolean;
}

const krw = (v: number) => formatMoney(v, "KRW" as CurrencyCode);
const flights = (c: TermContext) => c.input.includesFlights && c.input.tripScope === "overseas";

/** 특약 문구 — 여행자에게 불리한 부분은 근거 제시·실비 정산·설명 의무를 함께 적어 무효 위험을 줄였다 */
export const SPECIAL_TERMS: SpecialTerm[] = [
  {
    id: "air-ticket",
    region: null,
    title: "항공권 발권 후 취소",
    text: (c) =>
      `항공권을 발권한 뒤 여행자 사정으로 취소하면, 표준약관 제16조의 취소료와 별도로 항공권 취소 수수료 ${c.settings.airCancelFee > 0 ? `1인 ${krw(c.settings.airCancelFee)}` : "(항공사 규정에 따른 실비)"}를 부담합니다.${c.settings.noShowFee > 0 ? ` 출발 24시간 이내 취소하거나 연락 없이 불참하면 노쇼 위약금 1인 ${krw(c.settings.noShowFee)}이 추가됩니다.` : ""} 발권 일자는 예약 확정 때 안내하며, 여행자가 요청하면 항공사 규정 등 산정 근거를 제시합니다.`,
    differs: "표준약관에는 항공 취소 수수료를 따로 받는 규정이 없습니다.",
    recommended: flights,
  },
  {
    id: "prepaid",
    region: null,
    title: "선납 상품의 실제 손해 배상",
    text: () =>
      "이 상품은 항공·숙박 등 일부 비용을 공급업체에 미리 지급(선납)한 상품으로, 취소하면 표준약관 제16조의 취소료와 별도로 공급업체 규정에 따른 실제 손해액을 배상합니다. 여행자가 요청하면 여행사는 공급업체 취소 규정·영수증 등 산정 근거를 제시하며, 실제 손해보다 많이 받은 금액은 돌려드립니다.",
    differs: "표준약관의 기간별 취소료보다 많아질 수 있습니다(실제 손해 범위 안).",
    recommended: () => false,
  },
  {
    id: "business-days",
    region: null,
    title: "취소 접수 시점 (영업일)",
    text: (c) => `취소 통보는 여행사 영업시간(${c.settings.businessHours || "평일 업무시간"}) 안에 접수된 때를 기준으로 하며, 영업시간 밖·주말·공휴일에 접수하면 다음 영업일에 접수한 것으로 봅니다.`,
    differs: "표준약관은 접수 시점을 따로 정하지 않습니다.",
    recommended: (c) => c.settings.businessHours.trim() !== "",
  },
  {
    id: "force-majeure",
    region: null,
    title: "불가항력에 따른 일정 변경·추가 체류 비용",
    text: () =>
      "천재지변·전란·정부 명령·항공사 운항 중단·파업 등 여행사가 관여할 수 없는 사유로 일정이 바뀌거나 체류가 늘어나면, 대체 일정과 추가 체류 비용(숙박·식사·교통 등)은 여행자가 부담합니다. 여행사는 즉시 사유를 설명하고 대체 일정을 안내하며, 쓰지 않은 비용은 정산해 돌려드립니다.",
    differs: "표준약관 제12조②의 비용 부담 원칙을 구체적으로 적은 것입니다.",
    recommended: () => true,
  },
  {
    id: "flight-delay",
    region: null,
    title: "항공 지연·결항 보상",
    text: () =>
      "항공 지연·결항에 따른 보상은 항공사 운송약관과 관련 법령에 따르며, 여행사는 여행자의 보상 청구를 돕습니다. 다만 여행사의 고의·과실로 생긴 손해는 표준약관 제15조에 따라 여행사가 배상합니다.",
    differs: "항공사 책임 부분을 구분해 적은 것입니다(여행사 과실 책임은 그대로).",
    recommended: flights,
  },
  {
    id: "group-seat",
    region: null,
    title: "단체 항공권 제한",
    text: () => "단체 항공권으로 진행해 좌석 사전 지정·마일리지 적립·개별 귀국(일정 변경)이 제한될 수 있으며, 여행자 사정으로 개별 귀국하면 추가 항공료는 여행자가 부담합니다.",
    differs: "표준약관에는 없는 항공권 이용 조건입니다.",
    recommended: flights,
  },
  {
    id: "local-pay",
    region: null,
    title: "현지 지불 경비",
    text: () => "일정표에 '현지 지불'로 표시한 경비(가이드·기사 경비, 선택관광 등)는 여행요금에 포함되지 않으며 현지에서 지불합니다.",
    differs: "표준약관 제10조②의 별도 표시를 계약 조건으로 확인하는 것입니다.",
    recommended: () => true,
  },
  {
    id: "optional-tour",
    region: null,
    title: "선택관광·쇼핑",
    text: () =>
      "선택관광은 현지에서 신청·결제하며, 참여하지 않는 여행자는 인솔자가 안내하는 장소에서 자유시간을 보내거나 대기합니다. 선택관광·쇼핑에 참여하지 않는다는 이유로 추가 요금 등 불이익을 주지 않습니다.",
    differs: "운영 방식을 적은 것입니다(불참 불이익 금지 포함).",
    recommended: (c) => c.input.tripScope === "overseas",
  },
  {
    id: "documents",
    region: null,
    title: "여권·비자·입국 요건",
    text: () =>
      "여권(입국일 기준 남은 유효기간 6개월 이상)·비자·전자여행허가·입국신고 등 입국 요건 준비는 여행자 본인의 책임입니다. 여행사는 계약 때 국가별 요건을 안내하며, 여행자의 서류 미비로 출국·입국이 거부되면 표준약관 제16조의 취소료를 적용합니다.",
    differs: "서류 미비 책임을 여행자 쪽으로 명확히 한 것입니다(여행사 안내 의무는 그대로).",
    recommended: (c) => c.input.tripScope === "overseas",
  },
  {
    id: "single-room",
    region: null,
    title: "1인실 사용",
    text: () => "1인실을 원하거나 동행자 취소 등으로 1인실을 쓰게 되면 1인실 추가 요금(싱글 차지)을 여행자가 부담합니다.",
    differs: "요금 기준(2인 1실)과 다른 객실 사용 비용입니다.",
    recommended: (c) => c.input.packageType !== "land",
  },
  // ── 국가별 ──
  {
    id: "jp-disaster",
    region: "japan",
    title: "일본 — 자연재해·입국 수속",
    text: () =>
      "지진·태풍·화산 등 자연재해로 항공·철도 등이 멈추면 불가항력 특약에 따라 추가 체류 비용은 여행자가 부담합니다. 입국 수속(Visit Japan Web 등록 등)은 여행자 본인이 하며, 여행사는 방법을 안내합니다.",
    differs: "국가 사정을 구체적으로 적은 것입니다.",
    recommended: () => true,
  },
  {
    id: "cn-visa",
    region: "china",
    title: "중국 — 비자·단체비자",
    text: () =>
      "중국 입국 요건(비자 또는 무비자 입국 조건)은 출발 전 여행사가 확인해 안내합니다. 단체비자로 진행하면 비자 발급 뒤 명단·일정 변경과 개별 이탈이 불가하며, 여권 유효기간 부족 등 여행자 사유로 비자가 거절되면 비자 비용과 표준약관 제16조의 취소료를 부담합니다.",
    differs: "단체비자 운영 조건을 적은 것입니다.",
    recommended: () => true,
  },
  {
    id: "vn-entry",
    region: "vietnam",
    title: "베트남 — 여권·미성년자 서류",
    text: () =>
      "여권은 입국일 기준 6개월 이상 남아 있어야 합니다. 미성년자가 부모 중 한 명이나 제3자와 입국하면 영문 가족관계증명서·부모 동의서 등이 필요할 수 있으며, 서류 미비로 입국이 거부되면 여행자 책임입니다.",
    differs: "국가 입국 요건을 적은 것입니다.",
    recommended: () => true,
  },
  {
    id: "th-tdac",
    region: "thailand",
    title: "태국 — 디지털 입국카드(TDAC)",
    text: () => "입국 3일 이내에 태국 디지털 입국카드(TDAC)를 공식 사이트에서 무료로 작성해야 하며, 일정이 바뀌면 다시 작성합니다. 작성하지 않아 생긴 문제는 여행자 책임입니다.",
    differs: "국가 입국 요건을 적은 것입니다.",
    recommended: () => true,
  },
  {
    id: "ph-etravel",
    region: "philippines",
    title: "필리핀 — eTravel·미성년자",
    text: () =>
      "필리핀 eTravel을 입국·출국 때 각각 도착(출발) 72시간 이내에 작성해야 합니다. 부모와 함께 가지 않는 15세 미만 미성년자는 추가 서류(WEG 등)가 필요할 수 있으며, 서류 미비로 생긴 문제는 여행자 책임입니다.",
    differs: "국가 입국 요건을 적은 것입니다.",
    recommended: () => true,
  },
  {
    id: "sea-local",
    region: "sea",
    title: "동남아 — 현지 경비·쇼핑센터",
    text: () => "가이드·기사 경비 등 현지 지불 경비는 일정표에 적힌 금액을 현지에서 지불합니다. 쇼핑센터 방문 횟수는 일정표에 적힌 횟수를 넘지 않습니다.",
    differs: "현지 운영 조건을 적은 것입니다.",
    recommended: () => true,
  },
  {
    id: "us-esta",
    region: "usa",
    title: "미국·캐나다·괌·사이판 — 전자여행허가",
    text: () =>
      "미국 ESTA·캐나다 eTA 등 전자여행허가(괌·사이판은 ESTA 또는 비자면제 프로그램 요건)를 출발 전에 받아야 하며, 허가가 거절되거나 받지 않아 출발하지 못하면 표준약관 제16조의 취소료를 적용합니다.",
    differs: "국가 입국 요건을 적은 것입니다.",
    recommended: () => true,
  },
  {
    id: "uk-eta",
    region: "uk",
    title: "영국 — 전자여행허가(ETA)",
    text: () => "영국 입국 전 전자여행허가(ETA)를 받아야 하며, 받지 않아 출발·입국하지 못하면 표준약관 제16조의 취소료를 적용합니다.",
    differs: "국가 입국 요건을 적은 것입니다.",
    recommended: () => true,
  },
  {
    id: "eu-ees",
    region: "europe",
    title: "유럽 — EES·ETIAS",
    text: () =>
      "솅겐 지역 입국 때 출입국시스템(EES) 생체정보(얼굴·지문) 등록으로 입국 심사가 길어질 수 있으며, 이로 인한 일정 차질은 불가항력 특약에 따릅니다. 유럽 여행정보인증제(ETIAS)가 시행되면 출발 전 발급은 여행자 본인의 책임입니다.",
    differs: "국가 입국 요건을 적은 것입니다.",
    recommended: () => true,
  },
  {
    id: "oc-eta",
    region: "oceania",
    title: "호주·뉴질랜드 — ETA·검역",
    text: () => "호주 ETA·뉴질랜드 NZeTA를 출발 전에 받아야 하며, 입국 때 음식물·동식물 신고를 하지 않아 부과되는 벌금 등은 여행자 책임입니다.",
    differs: "국가 입국 요건을 적은 것입니다.",
    recommended: () => true,
  },
];

const SEA = new Set(["베트남", "태국", "필리핀", "말레이시아", "싱가포르", "인도네시아", "라오스", "캄보디아"]);
const EUROPE = new Set(["그리스·핀란드", "독일", "서북유럽", "스위스", "스페인", "이탈리아", "중부유럽", "포르투갈", "프랑스", "튀르키예"]);

/** 여행지에서 특약 지역들 (여러 도시면 모두) */
export function termRegions(destination: string): TermRegion[] {
  const out = new Set<TermRegion>();
  for (const part of destination.split(/[,/·]|→/).map((s) => s.trim()).filter(Boolean)) {
    const c = zoneOf(part)?.country ?? "";
    if (c === "일본") out.add("japan");
    if (c === "중국") out.add("china");
    if (c === "베트남") out.add("vietnam");
    if (c === "태국") out.add("thailand");
    if (c === "필리핀") out.add("philippines");
    if (SEA.has(c)) out.add("sea");
    if (["미국", "미국(하와이)", "괌", "사이판"].includes(c) || /캐나다|밴쿠버|토론토/.test(part)) out.add("usa");
    if (c === "영국") out.add("uk");
    if (EUROPE.has(c) && c !== "튀르키예") out.add("europe");
    if (c === "호주" || /뉴질랜드|오클랜드|퀸스타운/.test(part)) out.add("oceania");
  }
  return [...out];
}

export interface TermChoice {
  term: SpecialTerm;
  /** 이 상품에서 넣는가 (추천 + 상품별 켜고 끄기) */
  on: boolean;
  recommended: boolean;
}

/** 이 상품에 보여 줄 특약 — 공통 + 여행지 국가, 회사에서 끈 것은 뺀다. overrides: 상품별 켜고 끄기 */
export function termChoices(
  input: Pick<TripInput, "destination" | "includesFlights" | "tripScope" | "currency" | "packageType" | "specialTermOverrides">,
  settings: SpecialTermSettings,
): TermChoice[] {
  const ctx: TermContext = { input, settings };
  const regions = new Set(termRegions(input.destination));
  return SPECIAL_TERMS.filter((t) => !settings.disabled.includes(t.id) && (t.region === null || regions.has(t.region))).map((term) => {
    const recommended = term.recommended(ctx);
    const override = input.specialTermOverrides?.[term.id];
    return { term, recommended, on: typeof override === "boolean" ? override : recommended };
  });
}

export interface ContractTerm {
  title: string;
  text: string;
  differs: string;
}

/** 계약서에 넣을 특약 (켠 것 + 회사 고유 + 상품 메모) */
export function contractTerms(
  input: Pick<TripInput, "destination" | "includesFlights" | "tripScope" | "currency" | "packageType" | "specialTermOverrides" | "customSpecialTerms">,
  settings: SpecialTermSettings,
): ContractTerm[] {
  const ctx: TermContext = { input, settings };
  const chosen = termChoices(input, settings)
    .filter((c) => c.on)
    .map((c) => ({ title: c.term.title, text: c.term.text(ctx), differs: c.term.differs }));
  const extra = [...settings.custom.split("\n"), ...(input.customSpecialTerms ?? "").split("\n")]
    .map((s) => s.trim())
    .filter(Boolean)
    .map((text) => ({ title: "회사 특약", text, differs: "회사가 정한 조건입니다." }));
  return [...chosen, ...extra];
}

// ── 무효 위험 점검 ──────────────────────────────────────────

/** 표준약관 제16조 최고 비율(당일 50%)을 넘는 위약금, 소비자원이 30%로 조정한 사례가 있다 */
const MAX_REASONABLE_PENALTY = 50;

/** 특약 문구 하나의 무효 위험 (없으면 null) */
export function riskOf(text: string): string | null {
  const t = text.replace(/\s+/g, " ");
  if (/(일체|어떠한 경우에도|모든)\s*(책임|배상)[^.]*(지지 않|하지 않|없)/.test(t) || /책임을\s*지지\s*않습니다/.test(t) && !/고의|과실/.test(t))
    return "여행사 책임을 전부 면제하는 문구는 약관규제법 제7조로 무효가 될 수 있습니다 — 여행사 고의·과실 책임은 남겨 두세요.";
  if (/환불\s*(불가|되지 않)/.test(t) && !/근거|실제 손해|실비/.test(t))
    return "\"환불 불가\"는 실제 손해 범위를 넘으면 무효가 될 수 있습니다 — 산정 근거 제시·실제 손해 범위 안 정산을 함께 적으세요(공정위 시정).";
  const pcts = [...t.matchAll(/(\d{2,3})\s*%/g)].map((m) => Number(m[1]));
  if (/취소|위약|배상/.test(t) && pcts.some((p) => p > MAX_REASONABLE_PENALTY))
    return `위약금 ${Math.max(...pcts)}%는 과중해 조정될 수 있습니다 (표준약관 최고 50%, 소비자원은 특별약관 80%를 30%로 조정한 사례).`;
  if (/동의한\s*것으로\s*(봅|간주)/.test(t)) return "동의를 간주하는 문구는 특약의 설명·동의 요건(표준약관 제6조)을 채우지 못할 수 있습니다.";
  return null;
}

/** 계약서 특약 전체의 무효 위험 + 회사 설정 금액 점검 (인쇄 전 확인에 쓴다) */
export function contractTermRisks(terms: ContractTerm[], settings: SpecialTermSettings): string[] {
  const out = terms.map((t) => {
    const r = riskOf(t.text);
    return r ? `${t.title}: ${r}` : null;
  }).filter((x): x is string => x !== null);
  if (settings.noShowFee > 300_000) out.push(`노쇼 위약금 1인 ${krw(settings.noShowFee)}은 실제 손해를 넘으면 조정될 수 있습니다 — 산정 근거를 갖춰 두세요.`);
  return out;
}

// ── 입국 요건 (확인일 표시) ──────────────────────────────────

export interface EntryNote {
  region: TermRegion;
  text: string;
  /** 이 내용을 확인한 때 (바뀔 수 있어 문서에 함께 적는다) */
  checked: string;
}

/** 국가별 입국 요건 요약 — 문서에 확인일과 함께 적고, 출발 전 외교부 해외안전여행(0404.go.kr)에서 다시 확인하도록 안내한다 */
export const ENTRY_NOTES: EntryNote[] = [
  { region: "japan", text: "한국 여권 단기 무비자. Visit Japan Web으로 입국·세관 신고를 미리 할 수 있습니다.", checked: "2026-11" },
  { region: "china", text: "입국 요건(무비자 체류 기간·단체비자)이 자주 바뀌므로 출발 전 주한중국대사관 공지를 확인합니다.", checked: "2026-11" },
  { region: "vietnam", text: "여권 남은 유효기간 6개월 이상. 전자 입국신고서는 폐지되었습니다.", checked: "2026-11" },
  { region: "thailand", text: "입국 3일 이내 디지털 입국카드(TDAC) 작성 — 공식 사이트 무료, 일정이 바뀌면 다시 작성.", checked: "2026-11" },
  { region: "philippines", text: "eTravel을 입국·출국 각각 72시간 이내 작성 — 공식 사이트 무료.", checked: "2026-11" },
  { region: "usa", text: "미국 ESTA(괌·사이판은 ESTA 또는 비자면제 프로그램), 캐나다 eTA를 출발 전에 받습니다.", checked: "2026-11" },
  { region: "uk", text: "영국 전자여행허가(ETA)를 출발 전에 받습니다.", checked: "2026-11" },
  { region: "europe", text: "출입국시스템(EES) 생체정보 등록이 2026.4.10부터 전면 시행. ETIAS는 아직 운영 전(시작일 미공지).", checked: "2026-11" },
  { region: "oceania", text: "호주 ETA·뉴질랜드 NZeTA를 출발 전에 받고, 음식물·동식물은 반드시 신고합니다.", checked: "2026-11" },
];

export function entryNotes(destination: string): EntryNote[] {
  const regions = new Set(termRegions(destination));
  return ENTRY_NOTES.filter((n) => regions.has(n.region));
}
