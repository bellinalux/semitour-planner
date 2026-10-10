import { dayItems, type PmChoice } from "@/lib/itinerary";
import type { DayPlan, ItineraryItem, TripInput } from "@/types";

/**
 * 고객 니즈 점검 — 꼭 넣을 것이 들어갔는지, 피할 것이 빠졌는지, 동반자(시니어·아이·영유아·커플)에 맞는지.
 * 글자로만 본다 (AI 없음). 못 맞춘 것을 알려 주고, 고치는 건 직원이 한다.
 */

export interface NeedIssue {
  tone: "warn" | "info" | "ok";
  text: string;
}

const textOf = (i: ItineraryItem) => `${i.name} ${i.description} ${i.cuisine ?? ""}`;
const tokens = (s: string) =>
  s
    .split(/[,·/\n]|그리고|및/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");

const STAIRS = /계단|등산|트레킹|하이킹|오르막|정상|산행|협곡/;
const KID_FUN = /체험|동물|아쿠아|수족관|워터|놀이|테마파크|키즈|해변|비치|공원|모래|쿠킹/;
const NIGHT = /야경|일몰|선셋|sunset|night|야시장/i;
/** 피할 것 낱말 → 항목 유형 */
const AVOID_TYPE: [RegExp, ItineraryItem["type"]][] = [
  [/쇼핑/, "shopping"],
  [/마사지/, "massage"],
];

export function needsCheck(input: Pick<TripInput, "mustHave" | "avoid" | "companions">, days: DayPlan[], pmChoice: PmChoice): NeedIssue[] {
  const out: NeedIssue[] = [];
  const all = days.flatMap((d) => dayItems(d, pmChoice).map((i) => ({ d, i })));
  const hay = all.map((x) => norm(textOf(x.i)));
  for (const t of tokens(input.mustHave)) {
    const hit = hay.some((h) => h.includes(norm(t)));
    out.push(hit ? { tone: "ok", text: `꼭 넣을 것 "${t}" — 들어 있습니다` } : { tone: "warn", text: `꼭 넣을 것 "${t}"이(가) 일정에 없습니다` });
  }
  for (const t of tokens(input.avoid)) {
    const type = AVOID_TYPE.find(([re]) => re.test(t))?.[1];
    const hits = all.filter((x) => norm(textOf(x.i)).includes(norm(t)) || (type && x.i.type === type));
    if (hits.length > 0) out.push({ tone: "warn", text: `피할 것 "${t}" — ${hits.slice(0, 3).map((x) => `DAY ${x.d.day} ${x.i.name}`).join(", ")}` });
    else out.push({ tone: "ok", text: `피할 것 "${t}" — 없습니다` });
  }
  const tourDays = days.filter((d) => d.rest !== "free" && dayItems(d, pmChoice).some((i) => !["flight", "transfer", "hotel", "free_time"].includes(i.type ?? "sightseeing")));
  if (input.companions.includes("senior") || input.companions.includes("infant")) {
    const hard = all.filter((x) => STAIRS.test(textOf(x.i)));
    if (hard.length) out.push({ tone: "warn", text: `${input.companions.includes("senior") ? "시니어" : "영유아"} 동반인데 계단·오르막이 많은 곳: ${hard.slice(0, 4).map((x) => `DAY ${x.d.day} ${x.i.name}`).join(", ")}` });
    const long = all.filter((x) => (x.i.travelMinutesToNext ?? 0) >= 90 && x.i.type !== "flight");
    if (long.length) out.push({ tone: "info", text: `한 번에 1시간 30분 넘는 이동 ${long.length}번 — 중간 휴게소·화장실을 넣으세요` });
  }
  if (input.companions.includes("kids") || input.companions.includes("infant")) {
    const dull = tourDays.filter((d) => !dayItems(d, pmChoice).some((i) => KID_FUN.test(textOf(i))));
    if (dull.length) out.push({ tone: "warn", text: `아이가 즐길 곳(체험·동물·물놀이·공원)이 없는 날: ${dull.map((d) => `DAY ${d.day}`).join(", ")}` });
  }
  if (input.companions.includes("couple") && !all.some((x) => NIGHT.test(textOf(x.i)))) out.push({ tone: "info", text: "커플·신혼 동반인데 야경·일몰 일정이 없습니다" });
  return out;
}
