import { z } from "zod";
import { citiesOf } from "@/lib/knowledge";
import { addHotel } from "@/lib/rateBook";
import { GeminiError, generateGroundedText, generateJson } from "@/lib/server/gemini";
import { guardRequest } from "@/lib/server/guard";
import { updateRates } from "@/lib/server/rateStore";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

const requestSchema = z.object({
  destination: z.string().trim().min(1).max(100),
  names: z.array(z.string().trim().min(1).max(100)).min(1).max(6),
  /** 업체가 적은 등급 (예: "4성") — 실제 등급과 견준다 */
  claimedGrade: z.string().trim().max(40).default(""),
});

const resultSchema = z.object({
  hotels: z.array(
    z.object({
      name: z.string().describe("요청한 이름 그대로"),
      exists: z.boolean().describe("검색으로 실제 영업 중인 호텔임을 확인했으면 true"),
      officialName: z.string().describe("정식 이름 (영문 원문). 모르면 빈 문자열"),
      grade: z.string().describe("예약 사이트·공식 사이트의 등급 (예: 4성급). 모르면 빈 문자열"),
      area: z.string().describe("구/지역"),
      location: z.string().describe("주요 관광지·번화가까지 거리·위치 한 줄 (예: 미케비치 도보 5분, 시내 차로 15분)"),
      korean: z.boolean().describe("한국어 후기·커뮤니티에서 한국인 이용이 확인되면 true"),
      koreanNote: z.string().describe("한국인 이용 근거 한 줄. 없으면 빈 문자열"),
      agencies: z.array(z.string()).describe("이 호텔을 쓰는 국내 여행사 패키지 이름 (확인한 것만)"),
      note: z.string().describe("주의할 점 한 줄 (예: 업체 표기 4성과 달리 3.5성, 리모델링 중, 후기에 소음 불만). 없으면 빈 문자열"),
    }),
  ),
});

/**
 * 업체 견적서의 호텔 확인 — 실제로 있는지·정식 이름·등급·위치·한국인 이용·국내 여행사 패키지 사용을 웹에서 확인해 회사 요금표에 남긴다.
 */
export async function POST(request: Request) {
  const blocked = await guardRequest(request);
  if (blocked) return blocked;
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("BAD_REQUEST", "호텔 이름을 확인해 주세요.", 400);
  const { destination, names, claimedGrade } = parsed.data;
  try {
    const memo = await generateGroundedText({
      user: [
        `Google 검색 도구로 ${destination}의 아래 호텔을 하나씩 확인해 주세요. 여행사가 받은 업체 견적서에 적힌 호텔입니다${claimedGrade ? ` (업체 표기 등급: ${claimedGrade})` : ""}.`,
        ...names.map((n, i) => `${i + 1}. ${n}`),
        "",
        "호텔마다: 실제 영업 중인지, 정식 이름, 예약 사이트 등급, 구/지역, 주요 관광지까지 위치, 한국어 후기·한국 커뮤니티에서 한국인 이용이 확인되는지, 국내 여행사(하나투어·모두투어 등) 패키지에 쓰이는지, 주의할 점(등급 차이·공사·불만).",
        "확인하지 못한 것은 '확인 못함'이라고 쓰세요.",
      ].join("\n"),
      fast: true,
    });
    const r = await generateJson({
      fast: true,
      system: "조사 메모만 근거로 호텔 확인 결과를 JSON으로 정리합니다. 메모에 없는 내용은 지어내지 않습니다.",
      user: `<memo>\n${memo.text.slice(0, 12000)}\n</memo>\n\n호텔: ${names.join(" / ")}`,
      schema: resultSchema,
      temperature: 0.1,
    });
    const at = new Date().toISOString();
    const checks = names.map((n) => {
      const h = r.hotels.find((x) => x.name.replace(/\s/g, "") === n.replace(/\s/g, "")) ?? r.hotels[names.indexOf(n)];
      const ok = memo.searched && !!h;
      return {
        name: n,
        exists: ok ? h!.exists : false,
        officialName: h?.officialName.trim() ?? "",
        grade: h?.grade.trim() ?? "",
        area: h?.area.trim() ?? "",
        location: h?.location.trim() ?? "",
        korean: ok ? h!.korean : false,
        koreanNote: ok ? h!.koreanNote.trim() : "",
        agencies: ok ? h!.agencies.map((a) => a.trim()).filter(Boolean).slice(0, 6) : [],
        note: h?.note.trim() ?? (memo.searched ? "" : "웹 검색 근거를 찾지 못했습니다"),
        at,
      };
    });
    const city = citiesOf(destination)[0] ?? destination;
    await updateRates(city, (d) =>
      checks.reduce(
        (doc, c) =>
          addHotel(doc, {
            name: c.name,
            grade: c.grade,
            area: c.area,
            korean: c.korean,
            koreanNote: c.koreanNote,
            agencies: c.agencies,
            check: { exists: c.exists, officialName: c.officialName, grade: c.grade, area: c.area, location: c.location, note: c.note, at },
          }),
        d,
      ),
    );
    return Response.json({ checks, sources: memo.sources.slice(0, 6), searched: memo.searched });
  } catch (err) {
    if (err instanceof GeminiError) return errorResponse(err.code, err.message, err.status);
    console.error("[rates/check-hotels]", err);
    return errorResponse("INTERNAL", "호텔을 확인하지 못했습니다. 잠시 뒤 다시 시도해 주세요.", 500);
  }
}
