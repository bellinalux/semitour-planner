import { describe, expect, it } from "vitest";
import { getKv } from "@/lib/server/planStore";
import { saveProject, saveSchema, listVersions } from "@/lib/server/studioProjects";

describe("상세페이지 [저장] 자동 백업 — 검수 상태를 바꾸지 않음", () => {
  it("상태를 빼고 저장하면 지금 상태(승인)를 그대로 두고 새 버전만 쌓는다", async () => {
    const { kv } = (await getKv())!;
    const ws = "ws-autobackup-test";
    const a = await saveProject(kv, ws, saveSchema.parse({ title: "로마 투어", status: "approved", by: "팀장", data: { v: 1 } }));
    if (!a.ok) throw new Error("저장 실패");
    const b = await saveProject(kv, ws, saveSchema.parse({ id: a.entry.id, title: "로마 투어", by: "자동 백업", force: true, data: { v: 2 } }));
    if (!b.ok) throw new Error("저장 실패");
    expect(b.entry.status).toBe("approved");
    expect(b.entry.version).toBe(2);
    expect((await listVersions(kv, ws, a.entry.id)).map((v) => v.version)).toEqual([2, 1]);
  });
  it("새 프로젝트는 상태를 빼면 '작성 중'", async () => {
    const { kv } = (await getKv())!;
    const r = await saveProject(kv, "ws-autobackup-test2", saveSchema.parse({ title: "새 상품", by: "자동 백업", data: {} }));
    expect(r.ok && r.entry.status).toBe("draft");
  });
});
