// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccessGate } from "@/components/AccessGate";
import { useSession } from "@/components/SessionContext";
import { DocumentBar } from "@/components/dashboard/DocumentBar";
import { StepGuide } from "@/components/layout/StepGuide";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("인쇄 전 확인", () => {
  it("확인할 값이 있으면 바로 인쇄하지 않고, 체크해야 인쇄된다", () => {
    const onPrint = vi.fn();
    render(<DocumentBar disabled={false} missingLegal={[]} unconfirmed={["차량비 — 추정 (웹 검색)"]} onPrint={onPrint} />);
    fireEvent.click(screen.getByRole("button", { name: /견적서/ }));
    expect(onPrint).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog").textContent).toContain("차량비 — 추정 (웹 검색)");

    const printButton = screen.getByRole("button", { name: "인쇄" });
    expect((printButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(printButton);
    expect(onPrint).toHaveBeenCalledWith("quote");
  });

  it("확인할 값이 없으면 바로 인쇄", () => {
    const onPrint = vi.fn();
    render(<DocumentBar disabled={false} missingLegal={[]} unconfirmed={[]} onPrint={onPrint} />);
    fireEvent.click(screen.getByRole("button", { name: /견적서/ }));
    expect(onPrint).toHaveBeenCalledWith("quote");
  });

  it("내부 검토서는 확인 없이 인쇄", () => {
    const onPrint = vi.fn();
    render(<DocumentBar disabled={false} missingLegal={[]} unconfirmed={["x"]} onPrint={onPrint} />);
    fireEvent.click(screen.getByRole("button", { name: /원가·마진 검토서/ }));
    expect(onPrint).toHaveBeenCalledWith("internal");
  });
});

describe("진행 단계 안내", () => {
  it("지금 단계를 표시하고 누르면 그 단계 동작을 부른다", () => {
    const go = vi.fn();
    render(
      <StepGuide
        steps={[
          { label: "입력", status: "done", detail: "다낭", onClick: vi.fn() },
          { label: "코스", status: "current", detail: "누르면 코스 만들기", onClick: go },
        ]}
      />,
    );
    const current = screen.getByRole("button", { name: /코스/ });
    expect(current.getAttribute("aria-current")).toBe("step");
    fireEvent.click(current);
    expect(go).toHaveBeenCalledOnce();
  });
});

function WhoAmI() {
  const s = useSession();
  return <p>{s.user ? `${s.user.name}/${s.user.role}/${s.isAdmin ? "admin" : "staff"}` : "no-user"}</p>;
}

describe("로그인", () => {
  it("잠겨 있으면 코드를 받고, 맞으면 들어온 사람과 권한을 화면에 알려 준다", async () => {
    let authed = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          authed = JSON.parse(String(init.body)).code === "kim-123456";
          return new Response(JSON.stringify(authed ? { ok: true } : { error: { message: "접근 코드가 올바르지 않습니다." } }), { status: authed ? 200 : 401 });
        }
        return new Response(JSON.stringify({ required: true, authed, user: authed ? { name: "김세미", role: "staff", isMaster: false } : null, accounts: true }));
      }),
    );
    render(
      <AccessGate>
        <WhoAmI />
      </AccessGate>,
    );
    const input = await screen.findByLabelText("접근 코드");
    fireEvent.change(input, { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "입장" }));
    expect((await screen.findByRole("alert")).textContent).toContain("접근 코드가 올바르지 않습니다.");

    fireEvent.change(input, { target: { value: "kim-123456" } });
    fireEvent.click(screen.getByRole("button", { name: "입장" }));
    await waitFor(() => expect(screen.getByText("김세미/staff/staff")).toBeTruthy());
  });
});
