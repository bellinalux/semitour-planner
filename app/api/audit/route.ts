import { requireAdmin, workspaceId } from "@/lib/server/access";
import { readAudit } from "@/lib/server/audit";

/** 열람·변경 기록 (관리자) — 예약(고객 정보) 열람·수정, 직원 계정·회사 정보 변경, 로그인 */
export async function GET(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const ws = await workspaceId();
  return Response.json({ audit: ws ? (await readAudit(ws)).slice(0, 200) : [] });
}
