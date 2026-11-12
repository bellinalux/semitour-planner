import { describe, expect, it } from "vitest";
import type { Inquiry } from "@/lib/inquiry";
import { addInquiry, capInquiries, readInquiries, writeInquiries } from "@/lib/server/inquiryStore";

const inq = (id: string, at: string, done = false): Inquiry =>
  ({ id, at, done, name: id, contact: "010", destination: "다낭", departure: "", nights: 3, travelers: 2, budget: 0, style: "unsure", requests: "" }) as Inquiry;

describe("견적 요청함 저장", () => {
  it("동시에 들어온 요청이 서로 덮어쓰지 않고 모두 목록에 합쳐진다", async () => {
    await writeInquiries([inq("old", "2026-01-01T00:00:00Z")]);
    await Promise.all([addInquiry(inq("n1", "2026-02-01T00:00:00Z")), addInquiry(inq("n2", "2026-02-02T00:00:00Z"))]);
    const list = await readInquiries();
    expect(list.map((i) => i.id)).toEqual(["n2", "n1", "old"]);
    // 한 번 합친 뒤에도 그대로 (따로 둔 칸은 지워져 중복되지 않는다)
    expect((await readInquiries()).map((i) => i.id)).toEqual(["n2", "n1", "old"]);
  });

  it("개수 제한은 처리 안 한 요청을 남기고 처리한 오래된 것부터 버린다", () => {
    const list = [inq("a", "5", true), inq("b", "4"), inq("c", "3", true), inq("d", "2"), inq("e", "1", true)];
    expect(capInquiries(list, 3).map((i) => i.id)).toEqual(["a", "b", "d"]);
    expect(capInquiries(list, 2).map((i) => i.id)).toEqual(["b", "d"]);
  });
});
