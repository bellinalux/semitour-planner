// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { restoreBackup, type BackupFile } from "@/lib/backup";

const P = "semitour-planner:";
const file = (data: Record<string, string>): BackupFile => ({ app: "semitour-planner", version: 1, exportedAt: "", data });

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("restoreBackup", () => {
  it("바꾸고, 백업에 없는 세미투어 키는 지우고, 다른 앱 키는 둔다", () => {
    localStorage.setItem(`${P}a`, "old");
    localStorage.setItem(`${P}gone`, "x");
    localStorage.setItem("other", "keep");
    expect(restoreBackup(file({ [`${P}a`]: "new", [`${P}b`]: "1" }))).toBe(2);
    expect(localStorage.getItem(`${P}a`)).toBe("new");
    expect(localStorage.getItem(`${P}b`)).toBe("1");
    expect(localStorage.getItem(`${P}gone`)).toBeNull();
    expect(localStorage.getItem("other")).toBe("keep");
  });

  it("저장 공간이 모자라 중간에 실패하면 원래 데이터로 되돌린다", () => {
    localStorage.setItem(`${P}a`, "old");
    localStorage.setItem(`${P}keep`, "mine");
    const real = Storage.prototype.setItem;
    let calls = 0;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, k: string, v: string) {
      calls++;
      if (calls === 2) throw new DOMException("full", "QuotaExceededError");
      return real.call(this, k, v);
    });
    const r = restoreBackup(file({ [`${P}a`]: "new", [`${P}big`]: "x".repeat(10) }));
    expect(typeof r).toBe("string");
    expect(localStorage.getItem(`${P}a`)).toBe("old");
    expect(localStorage.getItem(`${P}keep`)).toBe("mine");
    expect(localStorage.getItem(`${P}big`)).toBeNull();
  });
});
