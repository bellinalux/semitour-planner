import type { AccessibilityResult, VerifyAccessibilityRequest, VerifyAccessibilityResponse } from "@/lib/schemas/accessibility";
import { accessibilityResultSchema } from "@/lib/schemas/accessibility";
import { buildAccessibilityResearchPrompt, buildAccessibilityStructurePrompt, ACCESSIBILITY_STRUCTURE_SYSTEM_PROMPT } from "./accessibilityPrompt";
import { generateGroundedText, generateJson } from "./gemini";

/** "확인 못함"으로 남아 있던 이용 편의시설 정보를 웹 검색으로 다시 조사한다. */
export async function verifyAccessibility(req: VerifyAccessibilityRequest): Promise<VerifyAccessibilityResponse> {
  // 1단계: 검색으로 조사, 2단계: 조사 메모를 JSON으로 정리
  const research = await generateGroundedText({ user: buildAccessibilityResearchPrompt(req) });
  const structured = await generateJson({
    system: ACCESSIBILITY_STRUCTURE_SYSTEM_PROMPT,
    user: buildAccessibilityStructurePrompt(req, research.text),
    schema: accessibilityResultSchema,
    temperature: 0,
  });

  const byId = new Map(structured.results.map((r) => [r.id, r]));
  // 검색 근거가 없으면 확인 정보를 믿을 수 없으므로 전부 unknown으로 낮춘다
  const results: AccessibilityResult[] = req.items.map((item) => {
    const raw = byId.get(item.id);
    if (!research.searched || !raw) {
      return { id: item.id, level: "unknown", wheelchairAccessible: false, accessibleRestroom: false, elevator: false, ramp: false, note: "" };
    }
    return { ...raw, note: raw.note.trim() };
  });

  return { results, sources: research.sources.slice(0, 8), searched: research.searched, checkedAt: new Date().toISOString() };
}
