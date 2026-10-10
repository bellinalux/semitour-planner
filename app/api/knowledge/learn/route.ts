import { z } from "zod";
import { learnCompetitor, learnEdits, learnFieldNotes, learnSale, learnStays, learnVotes } from "@/lib/knowledge";
import { isAuthed } from "@/lib/server/access";
import { bumpMetric, updateCity } from "@/lib/server/knowledgeStore";

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

const name = z.string().trim().min(1).max(80);
const city = z.string().trim().min(1).max(60);
const schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("stays"), city, stays: z.array(z.object({ name, minutes: z.number().min(0).max(1000) })).max(80) }),
  z.object({ kind: z.literal("notes"), city, notes: z.array(z.object({ at: z.string().max(40), day: z.number().int().min(0).max(60), type: z.string().max(20), text: z.string().max(300) })).max(50) }),
  z.object({ kind: z.literal("votes"), city, best: z.array(name).max(5), worst: z.array(name).max(5) }),
  z.object({ kind: z.literal("sale"), city, places: z.array(name).max(60), won: z.boolean() }),
  z.object({ kind: z.literal("edits"), city, removed: z.array(name).max(20).default([]), added: z.array(name).max(20).default([]) }),
  z.object({ kind: z.literal("competitor"), city, agency: z.string().trim().min(1).max(40), title: z.string().max(120).default(""), days: z.array(z.array(name).max(15)).max(31) }),
]);

/** 우리 자료로 배우기 — 현장 실측·현장 기록·고객 추천·판매 결과·직원 수정·다른 여행사 일정 (직원만, AI 없음) */
export async function POST(request: Request) {
  if (!(await isAuthed(request))) return errorResponse("UNAUTHORIZED", "접근 코드가 필요합니다.", 401);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("BAD_REQUEST", "내용을 확인해 주세요.", 400);
  const b = parsed.data;
  const doc = await updateCity(b.city, (d) => {
    switch (b.kind) {
      case "stays":
        return learnStays(d, b.stays);
      case "notes":
        return learnFieldNotes(d, b.notes);
      case "votes":
        return learnVotes(d, b.best, b.worst);
      case "sale":
        return learnSale(d, b.places, b.won);
      case "edits":
        return learnEdits(d, b.removed, b.added);
      case "competitor":
        return learnCompetitor(d, b.agency, b.title, b.days);
    }
  });
  await bumpMetric({ learned: 1, kind: b.kind, ...(b.kind === "edits" ? { removed: b.removed.length, added: b.added.length } : {}) });
  return Response.json({ ok: true, learnedCount: doc.learnedCount });
}
