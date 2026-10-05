/**
 * 회사 코스 템플릿 — 팀 보관함에서 '승인'된 상품(상세페이지 스튜디오)을 세미투어에서 바로 쓴다.
 *  GET /api/templates          → { templates: [{ id, title, region, summary, savedBy, savedAt }] }
 *  GET /api/templates?id=…     → { product }  (스튜디오 공통 상품 데이터 → 입력칸 채우기)
 */
import { isAuthed, workspaceId } from "@/lib/server/access";
import { getKv } from "@/lib/server/planStore";
import { getProject, listProjects, PROJECT_ID } from "@/lib/server/studioProjects";

function err(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

export async function GET(request: Request) {
  if (!(await isAuthed(request))) return err("UNAUTHORIZED", "접근 코드가 필요합니다.", 401);
  const ws = await workspaceId();
  const store = await getKv();
  if (!ws || !store) return Response.json({ templates: [], note: "접근 코드와 서버 저장소가 있어야 팀 템플릿을 씁니다." });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    const list = (await listProjects(store.kv, ws)).filter(p => p.status === "approved");
    return Response.json({ templates: list.map(p => ({ id: p.id, title: p.title, region: [p.country, p.region].filter(Boolean).join(" "), summary: p.summary ?? "", savedBy: p.savedBy, savedAt: p.savedAt, usable: !!p.hasProduct })) });
  }
  if (!PROJECT_ID.test(id)) return err("BAD_REQUEST", "템플릿 번호가 올바르지 않습니다.", 400);
  const p = await getProject(store.kv, ws, id);
  if (!p || p.status !== "approved") return err("NOT_FOUND", "승인된 템플릿이 아닙니다.", 404);
  if (!p.product) return err("NO_PRODUCT", "상세페이지 스튜디오에서 이 상품을 한 번 다시 저장하면 템플릿으로 쓸 수 있습니다.", 409);
  return Response.json({ product: p.product, title: p.title });
}
