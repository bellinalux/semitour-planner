import { describe, expect, it, vi } from "vitest";
import { cached } from "@/lib/server/aiCache";

describe("AI 결과 캐시", () => {
  it("같은 요청(키 순서만 다름)은 한 번만 계산한다", async () => {
    const compute = vi.fn(async () => ({ n: 1, searched: true }));
    await cached("t1", { a: 1, b: 2 }, 60, compute);
    const second = await cached("t1", { b: 2, a: 1 }, 60, compute);
    expect(compute).toHaveBeenCalledTimes(1);
    expect(second.n).toBe(1);
  });

  it("keep()이 거르는 결과(검색 근거 없음)는 저장하지 않는다", async () => {
    const compute = vi.fn(async () => ({ searched: false }));
    await cached("t2", { x: 1 }, 60, compute, (r) => r.searched);
    await cached("t2", { x: 1 }, 60, compute, (r) => r.searched);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("요청이 다르면 따로 계산한다", async () => {
    const compute = vi.fn(async () => 1);
    await cached("t3", { x: 1 }, 60, compute);
    await cached("t3", { x: 2 }, 60, compute);
    expect(compute).toHaveBeenCalledTimes(2);
  });
});
