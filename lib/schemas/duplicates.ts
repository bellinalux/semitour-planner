import { z } from "zod";

const itemRef = z.object({
  id: z.string().min(1).max(60),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(500),
});

/** 지역 투어를 새로 넣었을 때, 이미 일정에 있는 항목들과 중복되는지 비교하는 요청 */
export const findDuplicatesRequestSchema = z.object({
  newItem: itemRef,
  /** 같은 숙박 도시 구간에 있는 기존 항목들 (새로 넣은 항목 제외) */
  candidates: z.array(itemRef).min(1, "비교할 항목이 없습니다.").max(40, "한 번에 40개까지 비교할 수 있습니다."),
});

export type FindDuplicatesRequest = z.infer<typeof findDuplicatesRequestSchema>;

/** ---------- LLM 응답 ---------- */

export const duplicateResultSchema = z.object({
  duplicateIds: z
    .array(z.string())
    .describe(
      "newItem과 정확히 같은 장소·코스를 가리키는 기존 항목의 id만 넣습니다. 같은 장소라도 낮투어/야경투어처럼 시간대나 체험 성격이 다르면 중복이 아니므로 넣지 않습니다.",
    ),
});

export type DuplicateResult = z.infer<typeof duplicateResultSchema>;
