import { describe, expect, it } from "vitest";
import { pastedValue } from "@/lib/fastPaste";

describe("긴 글 빠른 붙여넣기", () => {
  it("커서 자리에 넣고 커서는 넣은 글 끝으로", () => {
    expect(pastedValue("가나다라", 2, 2, "XYZ")).toEqual({ value: "가나XYZ다라", caret: 5 });
  });
  it("선택한 부분은 바꾼다", () => {
    expect(pastedValue("가나다라", 1, 3, "X")).toEqual({ value: "가X라", caret: 2 });
  });
  it("글자 수 제한을 넘는 만큼만 잘라 넣는다 (뒤 글은 지킨다)", () => {
    expect(pastedValue("ab", 1, 1, "12345", 5)).toEqual({ value: "a123b", caret: 4 });
    expect(pastedValue("abcde", 5, 5, "123", 5)).toEqual({ value: "abcde", caret: 5 });
  });
  it("윈도우 줄바꿈(\\r\\n)은 \\n으로", () => {
    expect(pastedValue("", 0, 0, "1\r\n2\r3").value).toBe("1\n2\n3");
  });
});
