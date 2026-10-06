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

  it("같은 요청이 계산 중이면 기다렸다가 같은 결과를 받는다 (미리 조회 + 자동 견적)", async () => {
    let resolve!: (v: number) => void;
    const compute = vi.fn(() => new Promise<number>((r) => (resolve = r)));
    const a = cached("t4", { x: 1 }, 60, compute);
    const b = cached("t4", { x: 1 }, 60, compute);
    await vi.waitFor(() => expect(compute).toHaveBeenCalled());
    resolve(7);
    expect(await Promise.all([a, b])).toEqual([7, 7]);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("요청이 다르면 따로 계산한다", async () => {
    const compute = vi.fn(async () => 1);
    await cached("t3", { x: 1 }, 60, compute);
    await cached("t3", { x: 2 }, 60, compute);
    expect(compute).toHaveBeenCalledTimes(2);
  });
});
