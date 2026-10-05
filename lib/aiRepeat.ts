/**
 * AI(Gemini)가 같은 글을 끝없이 되풀이하는지 알아본다.
 * gemini-2.5-flash는 구조화 응답에서 가끔 "1일차: … 1일차: …"나 이모지를 길이 제한까지 되풀이한다(반복 억제 옵션은 이 모델에서 막혀 있다).
 * 상세페이지 스튜디오(32-ai-server.js)도 같은 기준을 쓴다.
 */

/** 2~60자 조각이 8번 넘게 이어진 가장 긴 구간 (공백만 되풀이한 것은 세지 않는다) */
function longestRun(text: string): { index: number; length: number } {
  const re = /([\s\S]{2,60}?)\1{7,}/g;
  let best = { index: -1, length: 0 };
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (/\S/.test(m[1]) && m[0].length > best.length) best = { index: m.index, length: m[0].length };
  }
  return best;
}

/** 되풀이 구간의 길이(글자) */
export function repeatedRun(text: string): number {
  return longestRun(text).length;
}

/** 되풀이가 시작되기 전까지의 글 */
export function beforeRepeat(text: string): string {
  const r = longestRun(text);
  return r.index >= 0 ? text.slice(0, r.index) : text;
}

/** 다시 받아야 하는 응답인가 — 되풀이하다 길이 제한에 잘렸거나, 잘리지 않았어도 되풀이가 아주 긴 경우 */
export function isRunaway(text: string, truncated: boolean): boolean {
  const run = repeatedRun(text);
  return (truncated && run >= 120) || run >= 1000;
}

/** 다시 요청할 때 붙이는 안내 */
export const ANTI_REPEAT_NOTE = "[중요] 앞 응답이 같은 글·기호·이모지를 되풀이하다 잘렸다. 어떤 말도 되풀이하지 말고, 각 항목을 짧게 써서 끝까지 완성하라.";
