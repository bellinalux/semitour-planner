import { addGround, addHotel, supplierObsFromQuote } from "@/lib/rateBook";
import { updateRates } from "@/lib/server/rateStore";
import { isVisualCourseFile } from "@/lib/courseFile";
import { courseRequestSchema, courseResponseSchema, toCoursePlan, type CourseRequest } from "@/lib/schemas/course";
import { extractCourseFileText } from "@/lib/server/courseFileExtract";
import { buildCourseUserPrompt, COURSE_SYSTEM_PROMPT } from "@/lib/server/coursePrompt";
import { GeminiError, generateJson } from "@/lib/server/gemini";
import { guardRequest } from "@/lib/server/guard";
import { withAiInfo } from "@/lib/server/aiProviders";
import { learnAgencyStays } from "@/lib/knowledge";
import { updateCity } from "@/lib/server/knowledgeStore";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

async function handlePost(request: Request) {
  const blocked = await guardRequest(request);
  if (blocked) return blocked;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("BAD_REQUEST", "요청 형식이 올바르지 않습니다.", 400);
  }

  const parsed = courseRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("BAD_REQUEST", parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.", 400);
  }

  // 사진·PDF는 Gemini가 파일을 직접 읽는다. 엑셀·한글(HWP)·텍스트는 서버에서 먼저 글자를 뽑아
  // 원문 텍스트처럼 취급한다 (Gemini가 직접 읽을 수 없는 형식이라서).
  let req: CourseRequest = parsed.data;
  if (parsed.data.file && !isVisualCourseFile(parsed.data.file.name)) {
    let extractedText: string;
    try {
      extractedText = (await extractCourseFileText(parsed.data.file)).text;
    } catch (err) {
      return errorResponse("BAD_REQUEST", err instanceof Error ? err.message : "파일을 읽지 못했습니다.", 422);
    }
    if (!extractedText.trim()) {
      return errorResponse("BAD_OUTPUT", "파일에서 코스 내용을 찾지 못했습니다. 다른 파일로 다시 시도해 주세요.", 422);
    }
    const note = parsed.data.text.trim();
    req = {
      ...parsed.data,
      text: note ? `${extractedText}\n\n<추가 설명>\n${note}` : extractedText,
      file: undefined,
    };
  }

  try {
    const result = await generateJson({
      system: COURSE_SYSTEM_PROMPT,
      user: buildCourseUserPrompt(req),
      schema: courseResponseSchema,
      temperature: 0.2,
      timeoutMs: 90_000,
      files: req.file ? [req.file] : [],
    });
    if (result.days.length === 0) {
      return errorResponse(
        "BAD_OUTPUT",
        "코스에서 일정을 찾지 못했습니다. DAY 1, DAY 2처럼 일차가 구분된 코스를 붙여넣어 주세요.",
        422,
      );
    }
    const plan = toCoursePlan(result);
    // 업체 견적서의 실제 요금(호텔 1박, 차량·가이드 1일)은 회사 요금표에 쌓는다
    const q = plan.quote;
    const city = plan.meta.cities?.[0] ?? "";
    if (q && city) {
      const { hotels, ground } = supplierObsFromQuote({ lines: q.lines, hotelNames: q.hotelNames, originalCurrency: q.currency || "KRW" }, plan.meta.packageName ? `업체 견적: ${plan.meta.packageName.slice(0, 30)}` : "업체 견적", 0);
      const names = q.hotelNames ?? [];
      if (hotels.length + ground.length + names.length > 0)
        await updateRates(city, (d) => {
          let doc = names.reduce((x, n) => addHotel(x, { name: n }), d);
          doc = hotels.reduce((x, h) => addHotel(x, { name: h.name }, h.obs), doc);
          return ground.reduce((x, g) => addGround(x, g.kind, g.label, g.obs), doc);
        });
    }
    // 원문에 소요 시간이 적힌 관광("약 30분 소요")은 지식 창고에 업체 표기로 쌓는다 — 다음 코스의 체류 시간 근거
    await learnFromSupplier(plan).catch(() => undefined);
    return Response.json(plan);
  } catch (err) {
    if (err instanceof GeminiError) return errorResponse(err.code, err.message, err.status);
    console.error("[parse-course]", err);
    return errorResponse("INTERNAL", "코스 분석 중 알 수 없는 오류가 발생했습니다.", 500);
  }
}

async function learnFromSupplier(plan: ReturnType<typeof toCoursePlan>) {
  const byCity = new Map<string, { name: string; minutes: number }[]>();
  const fallback = plan.meta.cities?.[0] ?? "";
  for (const d of plan.days) {
    const city = (d.overnightCity ?? "").trim() || fallback;
    if (!city) continue;
    for (const i of d.items)
      if (i.staySource === "competitor" && ["sightseeing", "experience", "shopping", "massage"].includes(i.type ?? "sightseeing") && i.stayMinutes > 0)
        byCity.set(city, [...(byCity.get(city) ?? []), { name: i.name, minutes: i.stayMinutes }]);
  }
  // 여행사 이름은 알 수 없어 "포함한 여행사" 점수에는 넣지 않는다 (체류 시간만)
  await Promise.all([...byCity].map(([city, stays]) => updateCity(city, (doc) => learnAgencyStays(doc, stays.slice(0, 20)))));
}

/** 대체 AI(Groq·Cloudflare)가 답하면 응답 머리글로 화면에 알린다 */
export const POST = withAiInfo(handlePost);
