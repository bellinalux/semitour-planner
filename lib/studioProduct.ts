/**
 * 스튜디오 상품 데이터(studio-product v1) — 상세페이지 스튜디오·쇼츠스튜디오·세미투어 스튜디오가 함께 쓰는 상품 형식.
 * 상세페이지 스튜디오의 [세미투어로 보내기]나 상품 데이터 파일(.json)로 받은 상품을 세미투어 입력칸 값으로 바꾼다.
 * 코스는 '붙여넣기' 모드의 코스 원문으로 넣는다 → [생성]을 누르면 기존 코스 분석(parse-course)이 일정으로 만든다.
 */
import { z } from "zod";
import type { TripInput } from "@/types";

const str = z.string().max(4000).optional();
const courseSchema = z.object({
  name: z.string().max(300),
  time: str, stay: str, desc: str, address: str,
  lat: z.number().optional(), lng: z.number().optional(),
});
export const studioProductSchema = z.object({
  schema: z.literal("studio-product"),
  version: z.number(),
  source: str,
  title: str, subtitle: str, intro: str,
  country: str, region: str,
  operatingDays: str, duration: str, minPax: str, maxPax: str, tourType: str, language: str,
  meeting: z.object({ time: str, place: str, address: str, note: str }).partial().optional(),
  included: z.array(z.string().max(500)).max(60).optional(),
  excluded: z.array(z.string().max(500)).max(60).optional(),
  notices: z.array(z.string().max(1000)).max(80).optional(),
  days: z.array(z.object({ title: str, courses: z.array(courseSchema).max(60) })).max(30).optional(),
});
export type StudioProduct = z.infer<typeof studioProductSchema>;

export function parseStudioProduct(raw: unknown): StudioProduct | null {
  const r = studioProductSchema.safeParse(raw);
  return r.success ? r.data : null;
}

const firstNumber = (s?: string) => { const m = /(\d+)/.exec(s ?? ""); return m ? Number(m[1]) : null; };
const MAX_COURSE_TEXT = 12000;

/** 상품 → 붙여넣기용 코스 원문 */
export function productCourseText(p: StudioProduct): string {
  const L: string[] = [];
  if (p.title) L.push(`[상품] ${p.title}`);
  const where = [p.region, p.country].filter(Boolean).join(", ");
  if (where) L.push(`지역: ${where}`);
  const info = [p.duration && `소요 ${p.duration}`, p.tourType, p.minPax && `최소 ${p.minPax}`, p.maxPax && `최대 ${p.maxPax}`, p.language && `${p.language} 진행`, p.operatingDays && `운영 ${p.operatingDays}`].filter(Boolean);
  if (info.length) L.push(info.join(" · "));
  const m = p.meeting ?? {};
  if (m.time || m.place) L.push(`미팅: ${[m.time, m.place, m.address].filter(Boolean).join(" ")}`);
  L.push("");
  const days = p.days ?? [];
  days.forEach((d, i) => {
    if (days.length > 1 || d.title) L.push(`DAY ${i + 1}${d.title ? ` ${d.title}` : ""}`);
    d.courses.forEach((c) => {
      const head = [c.time, c.name].filter(Boolean).join(" ");
      L.push(`- ${head}${c.stay ? ` (${c.stay})` : ""}${c.desc ? ` — ${c.desc}` : ""}`);
    });
    L.push("");
  });
  if (p.included?.length) L.push(`포함: ${p.included.join(", ")}`);
  if (p.excluded?.length) L.push(`불포함: ${p.excluded.join(", ")}`);
  return L.join("\n").trim().slice(0, MAX_COURSE_TEXT);
}

/** 상품 → 세미투어 입력칸에 덮어쓸 값 */
export function productToInputPatch(p: StudioProduct, current: Pick<TripInput, "travelers">): Partial<TripInput> {
  const dayCount = (p.days?.length ?? 0) > 1 ? p.days!.length : (firstNumber(/(\d+)\s*일/.exec(p.duration ?? "")?.[1]) ?? 1);
  const days = Math.min(14, Math.max(1, dayCount));
  const min = firstNumber(p.minPax);
  const domestic = /한국|대한민국|korea/i.test(p.country ?? "");
  const patch: Partial<TripInput> = {
    mode: "paste",
    courseText: productCourseText(p),
    days,
    nights: Math.max(0, days - 1),
    tripScope: domestic ? "domestic" : "overseas",
    notes: p.title ? `상세페이지 스튜디오에서 가져온 상품: ${p.title}` : "",
  };
  const where = [p.region, p.country].filter(Boolean).join(", ");
  if (where) patch.destination = where;
  if (min && min > 0) {
    patch.minTravelers = Math.min(50, min);
    if (current.travelers < min) patch.travelers = Math.min(50, min);
  }
  return patch;
}
