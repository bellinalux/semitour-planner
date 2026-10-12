import { englishDraftSchema, guideDraftSchema, phrasesDraftSchema, type GuideDraft, type GuideScript } from "@/lib/guideBook";
import type { PlaceCard } from "@/lib/knowledge";
import type { z } from "zod";
import { generateGroundedText, generateJson, type GroundingSource } from "./gemini";

/**
 * 가이드 설명 원고 초안 — 1단계 Google 검색(역사·볼거리·현장 동선·주의·자주 묻는 질문, 출처) → 2단계 해설집 형식으로 새로 쓴다.
 * 남의 글을 옮기지 않고, 확인한 사실로 가이드가 말하는 문장을 새로 쓴다. 확인 못한 숫자·연도는 쓰지 않는다.
 */
export async function draftScript(o: { city: string; name: string; area?: string; place?: PlaceCard | null }): Promise<{ draft: GuideDraft; sources: GroundingSource[]; searched: boolean }> {
  const known = o.place
    ? [
        o.place.area && `구역: ${o.place.area}`,
        o.place.likes.length > 0 && `여행자들이 좋아하는 점: ${o.place.likes.join(", ")}`,
        o.place.dislikes.length > 0 && `불만·주의: ${o.place.dislikes.join(", ")}`,
        o.place.tips.length > 0 && `팁: ${o.place.tips.join(", ")}`,
        o.place.fieldNotes.length > 0 && `우리 현장 기록: ${o.place.fieldNotes.join(" / ")}`,
      ]
        .filter(Boolean)
        .join("\n")
    : "";
  const memo = await generateGroundedText({
    user: [
      `Google 검색 도구를 여러 번 사용해서 ${o.city}의 "${o.name}"${o.area ? ` (${o.area})` : ""}을(를) 한국인 단체 손님에게 설명하는 가이드 입장에서 조사해 주세요.`,
      "1. 공식 사이트·관광청·백과사전 기준의 역사·유래·건축/자연 특징·숫자(연도, 높이 등)와 꼭 봐야 할 볼거리.",
      "2. 현장 진행 정보: 단체 버스 하차 위치, 매표·입장 방법(단체·예약·신분증), 보통 기다리는 시간, 화장실, 다시 모이기 좋은 곳, 사진 명소, 보통 관람 시간.",
      "3. 주의 사항: 복장 규정, 금지 물품·행동, 더위·계단, 소매치기 등.",
      "4. 한국인 여행자가 자주 묻는 질문과 답.",
      "확인한 사실만 짧게 정리하고, 출처 문장을 길게 옮기지 마세요. 확인하지 못한 숫자·연도는 쓰지 마세요.",
      known ? `\n참고 (우리 지식 창고):\n${known}` : "",
    ].join("\n"),
    timeoutMs: 110_000,
  });
  const draft = await generateJson({
    system: [
      "당신은 한국인 단체 여행 가이드 교육 담당입니다. 조사 메모의 사실만 근거로, 초보 가이드가 현장에서 그대로 읽어도 자연스러운 설명 원고를 한국어로 새로 씁니다.",
      "말투: 손님에게 말하는 존댓말(~입니다, ~예요), 쉬운 말, 한 문장은 짧게. 이야기→볼거리→사진·자유시간 안내 흐름.",
      "메모에 없는 숫자·연도·이름을 지어내지 않습니다. 출처 문장을 그대로 옮기지 않습니다. 모르는 칸은 빈 문자열.",
    ].join(" "),
    user: `<research_memo>\n${memo.text.slice(0, 16000)}\n</research_memo>\n\n도시: ${o.city}\n장소: ${o.name}${o.area ? `\n구역: ${o.area}` : ""}`,
    schema: guideDraftSchema,
    temperature: 0.4,
  });
  return { draft, sources: memo.sources.slice(0, 8), searched: memo.searched };
}

/**
 * 영어 원고 — 한국어 원고(직원이 검수한 사실)를 외국인 손님에게 말하는 자연스러운 영어로 다시 쓴다.
 * 웹 검색 없이 한국어 원고만 근거로 (새 사실을 더하지 않는다). 직역이 아니라 말하는 영어로.
 */
export async function draftEnglish(s: GuideScript): Promise<z.infer<typeof englishDraftSchema>> {
  const source = { place: s.name, area: s.area, intro: s.intro, points: s.points, site: s.site, cautions: s.cautions, faq: s.faq, audience: s.audience, mustKnow: s.mustKnow };
  return generateJson({
    system: [
      "You are a senior tour guide trainer. Rewrite the Korean guide script into natural spoken English that a guide can read aloud to international tourists.",
      "Keep every fact, number and name exactly as in the Korean script and do not add new facts. Use the common English names of places (with local names where helpful).",
      "Tone: warm, clear, short sentences, easy for non-native listeners. Keep the same points in the same order. Empty fields stay empty.",
    ].join(" "),
    user: `<korean_script>\n${JSON.stringify(source)}\n</korean_script>`,
    schema: englishDraftSchema,
    temperature: 0.3,
  });
}

/** 도시 현지 회화 (가이드·손님용) — 웹 검색 없이 표준 표현만 */
export async function draftPhrases(city: string): Promise<{ language: string; phrases: { ko: string; local: string; say: string }[] }> {
  return generateJson({
    system: "당신은 한국인 여행 가이드를 위한 현지 회화 카드를 만듭니다. 그 도시에서 실제로 쓰는 언어의 표준 표현만, 정확한 표기와 한글 발음으로 씁니다. 확실하지 않은 표현은 넣지 않습니다.",
    user: `도시: ${city}\n가이드와 손님이 자주 쓰는 표현 15~20개를 만들어 주세요 (인사, 감사, 미안합니다, 숫자 1~10, 얼마예요, 깎아 주세요, 화장실, 물, 계산서, 도와주세요, 병원, 경찰, 맵지 않게 등).`,
    schema: phrasesDraftSchema,
    temperature: 0.2,
  });
}
