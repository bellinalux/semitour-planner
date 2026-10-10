// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionProvider, type SessionInfo } from "@/components/SessionContext";
import { DocumentBar } from "@/components/dashboard/DocumentBar";
import { ExportBar } from "@/components/dashboard/ExportBar";

afterEach(() => cleanup());

const session = (role: "admin" | "staff" | "sales"): SessionInfo => ({ user: { name: "김영업", role, isMaster: false }, accounts: true, isAdmin: role === "admin", logout: async () => undefined });

function renderAs(role: "admin" | "staff" | "sales") {
  return render(
    <SessionProvider value={session(role)}>
      <DocumentBar disabled={false} missingLegal={[]} unconfirmed={[]} onPrint={vi.fn()} />
      <ExportBar disabled={false} getInternalText={() => ""} getCustomerText={() => ""} getEmojiText={() => ""} getListingText={() => ""} getListingCsv={() => ""} />
    </SessionProvider>,
  );
}

describe("영업 권한 (원가 숨김)", () => {
  it("영업은 내부 검토서·내부용 복사가 보이지 않고, 고객 문서·채널 등록은 보인다", () => {
    renderAs("sales");
    expect(screen.queryByRole("button", { name: /원가·마진 검토서/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "내부용 복사" })).toBeNull();
    expect(screen.getByRole("button", { name: "견적서" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "상품 정보 복사 (항목별)" })).toBeTruthy();
  });

  it("직원·관리자는 그대로 본다", () => {
    renderAs("staff");
    expect(screen.getByRole("button", { name: /원가·마진 검토서/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "내부용 복사" })).toBeTruthy();
  });
});
