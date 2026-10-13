import type { z } from "zod";
import { englishDraftSchema, factCheckSchema, guideDraftSchema, guideStopDraftSchema, phrasesDraftSchema, TIER, type GuideDraft, type GuideScript, type GuideTier } from "@/lib/guideBook";
import type { PlaceCard } from "@/lib/knowledge";
import { generateGroundedText, generateJson, type GroundingSource } from "./gemini";

/**
 * 가이드 설명 원고 (전문 유료 투어 수준) — 웹 조사를 4갈래로 나눠 하고(역사·숫자 / 전설·일화 / 관찰 포인트·상징 / 한국인 손님 관점·현장 진행),
 * 동선 따라 지점별 해설(도입·관찰·이야기·의미·한국 비교·질문·연결)로 새로 쓴 뒤, 조사 근거와 대조해 확인이 필요한 곳을 표시한다.
 * 남의 글을 옮기지 않고 확인한 사실로 새로 쓴다. 확인 못한 숫자·연도는 쓰지 않는다 (해석이 갈리면 가이드 노트로).
 */

const CHARS_PER_MIN = 250;

/** 등급별 분량 안내 (모델에게) */
function tierGuide(): string {
  return (Object.keys(TIER) as GuideTier[])
    .map((k) => {
      const t = TIER[k];
      // 지점 한 곳 최소 분량 = 목표 시간(가운데) ÷ 지점 수(가운데) — 모델은 요청보다 10~15% 짧게 쓰는 편이라 30% 넉넉히, 이야기는 그 절반 이상
      const per = Math.round(((((t.minutes[0] + t.minutes[1]) / 2) * CHARS_PER_MIN) / ((t.stops[0] + t.stops[1]) / 2)) * 1.3 / 100) * 100;
      return `- ${k} (${t.label}): 지점 ${t.stops[0]}~${t.stops[1]}곳, 기본 해설 합계 ${t.minutes[0]}~${t.minutes[1]}분 ≈ 한글 ${t.minutes[0] * CHARS_PER_MIN}~${t.minutes[1] * CHARS_PER_MIN}자 — 지점 한 곳(도입~연결) 최소 ${per}자, 그중 이야기(story) 최소 ${Math.round(per / 2 / 100) * 100}자`;
    })
    .join("\n");
}

const STYLE = [
  "당신은 20년 경력의 한국인 전문 가이드이자 가이드 교육 담당입니다. 돈을 내고 듣는 유료 투어 수준의 해설 원고를 씁니다.",
  "- 백과사전 요약이 아니라 이야기: 사람·사건·이유 중심으로 생생하게 ('왜 여기에?', '그때 무슨 일이?'). 숫자는 이야기 속에 자연스럽게.",
  "- 동선 따라 지점별로: 도착해서 첫 마디(주의 끌기) → '여기 보세요' 관찰 포인트(구체적인 장식·조각·벽화·건축 요소) → 이야기 → 의미 풀이 → 한국과 비교 → 손님에게 질문 → 다음 지점 연결.",
  "- 한국과 비교: 한국 손님이 아는 것(경복궁·불국사·단청·조선 왕조·한국 불교·한식 등)과 연도·규모·의미를 견주어 친근하게. 억지 비교는 하지 않는다.",
  "- 연출 표시: 말투·동작 지시를 대괄호로 짧게 넣는다 — [잠시 멈춤] [손으로 가리키며] [웃으며] [목소리를 낮추며] [모두 모이면] 등. 지점마다 1~3개.",
  "- 말투: 손님에게 말하는 존댓말(~입니다, ~예요, ~죠?), 쉬운 말, 한 문장은 짧게. 초보 가이드가 그대로 읽어도 전문가처럼 들리게.",
  "- 사실: 조사 메모에 있는 사실만. 숫자·연도·이름을 지어내지 않는다. 출처마다 다르거나 확실하지 않으면 본문에서 단정하지 말고 가이드 노트에 '해석이 갈림'으로 적는다.",
  "- 출처 문장을 그대로 옮기지 않는다 (새로 쓴다).",
].join("\n");

async function research(o: { city: string; name: string; area?: string; known: string }): Promise<{ memo: string; sources: GroundingSource[]; searched: boolean }> {
  const place = `${o.city}의 "${o.name}"${o.area ? ` (${o.area})` : ""}`;
  const asks = [
    `Google 검색 도구를 여러 번 사용해서 ${place}의 역사와 사실을 조사해 주세요. 공식 사이트·관광청·백과사전·학술 자료 기준: 누가·언제·왜 만들었는지, 시대 배경, 주요 건물·구역과 관람 동선 순서, 정확한 숫자(연도·크기·높이·재료), 지금의 쓰임. 출처마다 다른 숫자는 그대로 둘 다 적어 주세요.`,
    `Google 검색 도구를 여러 번 사용해서 ${place}에 얽힌 전설·일화·인물 이야기·숨은 이야기·흥미로운 사실을 조사해 주세요. 현지인·전문 가이드가 들려주는 이야기, 사건과 사람 중심으로. 사실과 전설을 구분해서 적어 주세요.`,
    `Google 검색 도구를 여러 번 사용해서 ${place} 현장에서 눈으로 찾아볼 디테일을 관람 동선 순서대로 조사해 주세요: 장식·조각·벽화·건축 요소·조형물과 그 상징·의미, 건축 양식, 종교·문화적 의미. 지점(구역)별로 나눠 적어 주세요.`,
    `Google 검색 도구를 여러 번 사용해서 한국인 여행자 관점에서 ${place}를 조사해 주세요: 한국인 여행 블로그·카페·가이드 투어 후기에서 흥미로워한 점·자주 묻는 질문·아쉬워한 점, 현장 진행 팁(단체 버스 하차 위치, 매표·입장·대기 시간, 화장실, 집결하기 좋은 곳, 사진 명소, 보통 관람 시간), 복장 규정·주의 사항.`,
  ];
  const results = await Promise.all(asks.map((user) => generateGroundedText({ user: `${user}\n확인한 사실만 짧게 정리하고, 출처 문장을 길게 옮기지 마세요.`, timeoutMs: 120_000 }).catch(() => null)));
  const ok = results.filter((r): r is NonNullable<typeof r> => r !== null);
  if (ok.length === 0) throw new Error("장소 조사를 하지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
  const titles = ["역사·사실", "전설·일화", "관찰 포인트·상징", "한국인 손님 관점·현장 진행"];
  const memo = results
    .map((r, i) => (r ? `## ${titles[i]}\n${r.text.slice(0, 9000)}` : ""))
    .filter(Boolean)
    .join("\n\n");
  const seen = new Set<string>();
  const sources = ok
    .flatMap((r) => r.sources)
    .filter((s) => (seen.has(s.title) ? false : (seen.add(s.title), true)))
    .slice(0, 12);
  return { memo: o.known ? `${memo}\n\n## 우리 지식 창고\n${o.known}` : memo, sources, searched: ok.some((r) => r.searched) };
}

/** 원고를 조사 근거와 대조 — 근거와 다르거나 근거가 없거나 원고 안에서 서로 다른 곳 (실패해도 원고는 낸다) */
async function factCheck(memo: string, draft: GuideDraft): Promise<{ where: string; claim: string; reason: string }[]> {
  const body = {
    intro: draft.intro,
    stops: draft.stops.map((s, i) => ({ 지점: i + 1, title: s.title, look: s.look, story: s.story, meaning: s.meaning, korea: s.korea, question: s.question, more: s.more })),
    guideNotes: draft.guideNotes,
    faq: draft.faq,
    mustKnow: draft.mustKnow,
  };
  try {
    const r = await generateJson({
      system:
        "당신은 여행 해설 원고 검수자입니다. 조사 메모(근거)와 원고를 대조해 숫자·연도·이름·사실 주장 가운데 근거와 다르거나, 근거에 없거나, 원고 안에서 서로 다른 곳만 찾습니다. 문체·분량은 보지 않습니다. 한국과 비교한 일반 상식(예: 경복궁 창건 1395년)은 맞으면 넘어갑니다. 문제가 없으면 빈 배열.",
      user: `<research_memo>\n${memo.slice(0, 30000)}\n</research_memo>\n\n<script>\n${JSON.stringify(body)}\n</script>`,
      schema: factCheckSchema,
      temperature: 0.1,
      timeoutMs: 120_000,
    });
    return r.issues.slice(0, 20).map((i) => ({ where: i.where.slice(0, 160), claim: i.claim.slice(0, 500), reason: i.reason.slice(0, 600) }));
  } catch {
    return [];
  }
}

function knownText(place: PlaceCard | null | undefined): string {
  if (!place) return "";
  return [
    place.area && `구역: ${place.area}`,
    place.likes.length > 0 && `여행자들이 좋아하는 점: ${place.likes.join(", ")}`,
    place.dislikes.length > 0 && `불만·주의: ${place.dislikes.join(", ")}`,
    place.tips.length > 0 && `팁: ${place.tips.join(", ")}`,
    place.fieldNotes.length > 0 && `우리 현장 기록: ${place.fieldNotes.join(" / ")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** 회사 말투 예시 — 검수 완료된 새 방식 원고의 한 지점 (있으면) */
function styleExample(example: GuideScript | null | undefined): string {
  if (!example) return "";
  const stop = example.points.find((p) => p.hook && p.text) ?? example.points[0];
  if (!stop) return "";
  return `\n\n<company_style_example 설명="우리 회사가 검수한 원고의 한 지점 — 이 말투·깊이·연출 표시 방식을 따른다 (내용은 베끼지 않는다)">\n${JSON.stringify({ 장소: example.name, 지점: stop })}\n</company_style_example>`;
}

export async function draftScript(o: {
  city: string;
  name: string;
  area?: string;
  place?: PlaceCard | null;
  tier?: GuideTier;
  veteran?: string;
  example?: GuideScript | null;
}): Promise<{ draft: GuideDraft; sources: GroundingSource[]; searched: boolean; checks: { where: string; claim: string; reason: string }[] }> {
  const r = await research({ city: o.city, name: o.name, area: o.area, known: knownText(o.place) });
  const draft = await generateJson({
    system: STYLE,
    user: [
      `<research_memo>\n${r.memo.slice(0, 36000)}\n</research_memo>`,
      o.veteran?.trim() ? `\n<veteran_guide_memo 설명="우리 베테랑 가이드의 멘트·현장 팁 — 반드시 원고에 녹여 넣는다">\n${o.veteran.trim().slice(0, 3000)}\n</veteran_guide_memo>` : "",
      styleExample(o.example),
      `\n도시: ${o.city}\n장소: ${o.name}${o.area ? `\n구역: ${o.area}` : ""}`,
      `\n분량 기준 (등급을 고르고 그 분량을 반드시 채운다 — 짧으면 실패):\n${tierGuide()}`,
      o.tier ? `\n이 장소의 등급은 ${o.tier}로 정해져 있다.` : "\n장소의 규모·중요도를 보고 등급을 고른다 (도시 대표 명소·대형 궁궐·사원·유적은 major).",
      "\n지점은 실제 관람 동선 순서대로. 각 지점의 이야기(story)를 가장 길고 풍부하게 쓴다.",
    ].join("\n"),
    schema: guideDraftSchema,
    temperature: 0.5,
    timeoutMs: 240_000,
  });
  const full = await fillStops(r.memo, draft, o);
  const checks = await factCheck(r.memo, full);
  return { draft: full, sources: r.sources, searched: r.searched, checks };
}

/** 지점 한 곳 기본 해설 글자 수 (연출 표시·띄어쓰기 빼고) */
const stopChars = (p: GuideDraft["stops"][number]) => [p.hook, p.look, p.story, p.meaning, p.korea, p.question, p.transition].join("").replace(/\[[^\]]*\]/g, "").replace(/\s/g, "").length;

/**
 * 분량 채우기 — 한 번에 쓴 원고는 지점마다 1,000자 안팎에서 멈추는 일이 많다. 등급 기준보다 짧으면
 * 지점마다 따로(동시에) 다시 써서 이야기·관찰·의미를 채운다 (같은 조사 메모만 근거, 새 검색 없음).
 */
async function fillStops(memo: string, draft: GuideDraft, o: { city: string; name: string }): Promise<GuideDraft> {
  const t = TIER[draft.tier];
  const target = ((t.minutes[0] + t.minutes[1]) / 2) * CHARS_PER_MIN;
  const total = draft.stops.reduce((n, p) => n + stopChars(p), 0) + draft.intro.replace(/\s/g, "").length;
  if (draft.stops.length === 0 || total >= t.minutes[0] * CHARS_PER_MIN) return draft;
  const per = Math.round((target / draft.stops.length) * 1.3);
  const stops = await Promise.all(
    draft.stops.map(async (stop, i) => {
      try {
        const next = await generateJson({
          system: STYLE,
          user: [
            `<research_memo>\n${memo.slice(0, 30000)}\n</research_memo>`,
            `\n<tour_outline>\n${JSON.stringify(draft.stops.map((s, k) => `${k + 1}. ${s.title}`))}\n</tour_outline>`,
            `\n<current_stop index="${i + 1}">\n${JSON.stringify(stop)}\n</current_stop>`,
            `\n장소: ${o.city} ${o.name} / 지점 ${i + 1}: ${stop.title}`,
            `이 지점 하나만 더 풍부하게 다시 쓴다 — 기본 해설(도입~연결) 한글 최소 ${per}자, 그중 이야기(story) 최소 ${Math.round(per * 0.55)}자. 관찰 포인트는 눈으로 찾을 디테일을 2~4개, 의미 풀이와 한국 비교도 보강. 다른 지점에서 할 이야기는 가져오지 않는다. 지금의 맞는 사실은 살리고 새 사실은 메모에 있는 것만.`,
          ].join("\n"),
          schema: guideStopDraftSchema,
          temperature: 0.5,
          timeoutMs: 180_000,
        });
        return stopChars(next) > stopChars(stop) ? next : stop;
      } catch {
        return stop;
      }
    }),
  );
  return { ...draft, stops };
}

/** 지점 한 곳 더 깊게 — 그 지점 주제로 다시 조사해 이야기·관찰 포인트·의미를 두세 배로 */
export async function deepenStop(s: GuideScript, index: number): Promise<z.infer<typeof guideStopDraftSchema>> {
  const stop = s.points[index];
  const memo = await generateGroundedText({
    user: `Google 검색 도구를 여러 번 사용해서 ${s.city} "${s.name}"의 "${stop.title}" 부분을 깊이 조사해 주세요: 역사·인물·전설·일화, 눈으로 찾아볼 디테일과 그 상징, 흥미로운 사실, 한국인 손님이 궁금해할 점. 확인한 사실만 짧게 정리하고 출처 문장을 옮기지 마세요.`,
    timeoutMs: 120_000,
  });
  const per = Math.round((TIER[s.tier].minutes[1] / Math.max(1, s.points.length)) * 1.5);
  return generateJson({
    system: STYLE,
    user: [
      `<research_memo>\n${memo.text.slice(0, 20000)}\n</research_memo>`,
      `\n<current_stop>\n${JSON.stringify(stop)}\n</current_stop>`,
      `\n장소: ${s.city} ${s.name} / 지점: ${stop.title}`,
      `지금 지점 원고를 바탕으로 더 깊고 풍부하게 다시 쓴다 — 이야기(story)를 크게 늘리고(약 ${per}분 ≈ 한글 ${per * CHARS_PER_MIN}자), 관찰 포인트를 더 구체적으로, 의미 풀이와 한국 비교를 보강한다. 기존의 맞는 사실은 살리고 새 사실은 메모에 있는 것만.`,
    ].join("\n"),
    schema: guideStopDraftSchema,
    temperature: 0.5,
    timeoutMs: 180_000,
  });
}

/**
 * 영어 원고 — 한국어 원고(직원이 검수한 사실)를 외국인 손님에게 말하는 자연스러운 영어로 다시 쓴다.
 * 웹 검색 없이 한국어 원고만 근거로 (새 사실을 더하지 않는다). 직역이 아니라 말하는 영어로, 분량·깊이는 그대로.
 */
export async function draftEnglish(s: GuideScript): Promise<z.infer<typeof englishDraftSchema>> {
  const source = {
    place: s.name,
    area: s.area,
    intro: s.intro,
    stops: s.points.map((p) => ({ title: p.title, hook: p.hook, look: p.look, story: p.text, meaning: p.meaning, korea: p.korea, question: p.question, transition: p.transition, more: p.more })),
    site: s.site,
    cautions: s.cautions,
    faq: s.faq,
    audience: s.audience,
    mustKnow: s.mustKnow,
  };
  return generateJson({
    system: [
      "You are a senior tour guide trainer. Rewrite the Korean guide script into natural spoken English that a professional guide reads aloud to international tourists on a paid tour.",
      "Keep every fact, number and name exactly as in the Korean script and do not add new facts. Use the common English names of places (with local names where helpful).",
      "Keep the same stops, the same depth and roughly the same length. Keep stage directions in square brackets, translated (e.g. [pause], [point to the roof], [smile]).",
      "Comparisons with Korea: replace them with comparisons international visitors relate to (world-famous landmarks, well-known history), or leave empty.",
      "Tone: warm, clear, short sentences, easy for non-native listeners. Empty fields stay empty.",
    ].join(" "),
    user: `<korean_script>\n${JSON.stringify(source)}\n</korean_script>`,
    schema: englishDraftSchema,
    temperature: 0.3,
    timeoutMs: 240_000,
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
