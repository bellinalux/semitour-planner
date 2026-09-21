import { z } from "zod";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-3.8-flash";

export type GeminiErrorCode = "NO_KEY" | "UPSTREAM" | "TIMEOUT" | "BAD_OUTPUT";

export class GeminiError extends Error {
  constructor(
    public code: GeminiErrorCode,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

interface GenerateJsonOptions<T extends z.ZodType> {
  system: string;
  user: string;
  schema: T;
  temperature?: number;
  timeoutMs?: number;
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
}

/** Gemini가 거절하는 키(minItems/maxItems)는 빼고 보낸다. 개수 제한은 응답 후 zod가 검증한다. */
const UNSUPPORTED_KEYS = new Set(["$schema", "minItems", "maxItems"]);

function stripUnsupported(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripUnsupported);
  if (node && typeof node === "object") {
    return Object.fromEntries(
      Object.entries(node as Record<string, unknown>)
        .filter(([key]) => !UNSUPPORTED_KEYS.has(key))
        .map(([key, value]) => [key, stripUnsupported(value)]),
    );
  }
  return node;
}

function toResponseSchema(schema: z.ZodType) {
  return stripUnsupported(z.toJSONSchema(schema));
}

async function callGemini(
  body: Record<string, unknown>,
  apiKey: string,
  model: string,
  timeoutMs: number,
): Promise<{ ok: true; data: GeminiResponse } | { ok: false; status: number; message: string }> {
  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new GeminiError("TIMEOUT", "AI 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.", 504);
    }
    throw new GeminiError("UPSTREAM", "AI 서버에 연결하지 못했습니다.", 502);
  }

  const data = (await res.json().catch(() => ({}))) as GeminiResponse;
  if (!res.ok) return { ok: false, status: res.status, message: data.error?.message ?? res.statusText };
  return { ok: true, data };
}

function extractText(data: GeminiResponse): string {
  if (data.promptFeedback?.blockReason) {
    throw new GeminiError("BAD_OUTPUT", "요청이 안전 정책에 의해 차단되었습니다. 입력 내용을 바꿔 보세요.", 422);
  }
  const candidate = data.candidates?.[0];
  if (candidate?.finishReason === "MAX_TOKENS") {
    throw new GeminiError("BAD_OUTPUT", "AI 응답이 너무 길어 잘렸습니다. 여행 기간을 줄여 보세요.", 502);
  }
  return (candidate?.content?.parts ?? []).map((p) => p.text ?? "").join("");
}

/**
 * Gemini에 JSON 응답을 요청하고 zod로 검증한다.
 * 형식이 어긋나면 1회 재시도하며, 구조화 출력(responseJsonSchema)이 거절되면 스키마 없이 재시도한다.
 */
export async function generateJson<T extends z.ZodType>({
  system,
  user,
  schema,
  temperature = 0.7,
  timeoutMs = 90_000,
}: GenerateJsonOptions<T>): Promise<z.output<T>> {
  // 대시보드에 붙여넣다가 딸려 오기 쉬운 따옴표, 공백, 줄바꿈, "GEMINI_API_KEY=" 글자를 걷어낸다
  const apiKey = process.env.GEMINI_API_KEY?.trim()
    .replace(/^GEMINI_API_KEY\s*=\s*/, "")
    .replace(/^["']+|["']+$/g, "")
    .trim();
  if (!apiKey) {
    throw new GeminiError("NO_KEY", "서버에 GEMINI_API_KEY가 설정되지 않았습니다. .env.local을 확인해 주세요.", 500);
  }
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

  let useSchema = true;
  let lastProblem = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const generationConfig: Record<string, unknown> = {
      responseMimeType: "application/json",
      temperature,
      maxOutputTokens: 32768,
    };
    if (useSchema) generationConfig.responseJsonSchema = toResponseSchema(schema);

    const retryNote = lastProblem
      ? `\n\n[이전 응답 오류] ${lastProblem}\n스키마를 정확히 지켜 JSON만 다시 출력하세요.`
      : "";

    const result = await callGemini(
      {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user + retryNote }] }],
        generationConfig,
      },
      apiKey,
      model,
      timeoutMs,
    );

    if (!result.ok) {
      // Gemini는 잘못된 API 키에도 400을 돌려준다. 키 문제는 스키마 폴백으로 해결되지 않으므로 바로 알린다.
      const isKeyProblem = result.status === 401 || result.status === 403 || /API key/i.test(result.message);
      if (isKeyProblem) {
        throw new GeminiError(
          "UPSTREAM",
          "API 키가 올바르지 않거나 권한이 없습니다. 서버에 등록한 GEMINI_API_KEY 값에 따옴표, 공백, 'GEMINI_API_KEY=' 글자가 섞이지 않았는지 확인해 주세요.",
          502,
        );
      }
      if (result.status === 400 && useSchema) {
        console.error(`[gemini] 구조화 출력 스키마 거절(400): ${result.message}`);
        useSchema = false; // 구조화 출력 스키마가 거절된 경우: 프롬프트 + zod 검증만으로 재시도
        lastProblem = "";
        attempt--; // 스키마 폴백은 재시도 횟수에 포함하지 않는다
        continue;
      }
      const hint =
        result.status === 429
          ? "AI 사용량 한도를 초과했습니다. 잠시 후 다시 시도해 주세요."
          : `AI 서버 오류 (${result.status}). ${result.message.slice(0, 120)}`;
      throw new GeminiError("UPSTREAM", hint, result.status === 429 ? 429 : 502);
    }

    const text = extractText(result.data);
    try {
      const parsed = schema.safeParse(JSON.parse(text));
      if (parsed.success) return parsed.data;
      lastProblem = parsed.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
    } catch {
      lastProblem = "유효한 JSON이 아닙니다.";
    }
    console.error(`[gemini] 응답 검증 실패 (시도 ${attempt + 1}, 스키마 ${useSchema ? "사용" : "미사용"}): ${lastProblem}\n${text.slice(0, 400)}`);
  }

  throw new GeminiError("BAD_OUTPUT", "AI 응답을 해석하지 못했습니다. 다시 시도해 주세요.", 502);
}
