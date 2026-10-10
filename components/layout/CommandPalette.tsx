"use client";

import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SettingsSection } from "@/components/form/settingsFocus";

export interface Command {
  label: string;
  /** 같이 찾을 말 */
  keywords: string;
  group: "이동" | "열기" | "입력";
  run: () => void;
}

/** 상단 버튼을 글자로 찾아 누른다 (더보기 안의 메뉴도) */
function clickButton(text: string) {
  const btn = [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === text);
  btn?.click();
}

/** 화면에서 쓰는 명령 목록 */
export function plannerCommands(go: { scroll: (id: string) => void; settings: (s: SettingsSection) => void; input: () => void }): Command[] {
  const scroll = (label: string, id: string, keywords: string): Command => ({ label, keywords, group: "이동", run: () => go.scroll(id) });
  const open = (label: string, button: string, keywords: string): Command => ({ label, keywords, group: "열기", run: () => clickButton(button) });
  const setting = (label: string, s: SettingsSection, keywords: string): Command => ({ label, keywords, group: "입력", run: () => go.settings(s) });
  return [
    { label: "여행 기본 입력", keywords: "여행지 기간 인원 출발일 입력", group: "입력", run: go.input },
    setting("가격 방식·회사 수익률", "pricing", "마진 판매가 수익률 통화 채널 가격"),
    setting("원가 직접 입력", "cost", "차량 가이드 숙박 원가 비용"),
    setting("상품 구성·숙소·항공", "package", "호텔 숙소 항공 풀패키지 랜드"),
    setting("고객·문서 정보", "documents", "고객 이름 수신 명단 문서"),
    setting("판매 채널", "channels", "플랫폼 수수료 채널"),
    setting("경쟁사 정보", "competitors", "경쟁 타업체 비교 입력"),
    scroll("코스 점검 (100점 만들기)", "course-engine", "엔진 점수 동선 지그재그"),
    scroll("업체 견적 검증·기록", "supplier-check", "공급가 랜드사 업체 환율 기록"),
    scroll("고객 제시용 가격 (A/B/C안·인원별)", "customer-prices", "등급 인원 요금표 abc"),
    scroll("시리즈 출발·할인 규칙", "series-prices", "회차 시리즈 얼리버드 조기 할인 연휴"),
    scroll("가격 낮추기", "price-levers", "절감 싸게 경쟁 순위"),
    scroll("투어 비교표 (우리 vs 경쟁)", "tour-compare", "경쟁 비교 타업체"),
    scroll("출발 준비·명단·정산", "ops-panel", "체크리스트 룸리스트 명단 정산 손익 실제"),
    scroll("문서 인쇄 (견적서·일정표·영문)", "documents", "pdf 인쇄 견적서 계약서 영문 비교견적서 운영지시서 링크 공유"),
    open("근교 투어 만들기", "근교 투어", "반일 당일 투어 유류비 통행료 대중교통 도보"),
    open("예약 관리", "예약 관리", "예약 입금 잔금 고객 연락 후기 만족도"),
    open("저장·불러오기", "저장·불러오기", "저장 불러오기 일정 잘 팔린"),
    open("이력·백업 (견적 성과)", "이력·백업", "이력 백업 성과 성약률 통계"),
    open("회사 설정", "회사 설정", "회사 정보 등록번호 연락처"),
    open("사용 안내", "사용 안내", "도움말 처음 안내 사용법"),
  ];
}

/**
 * 기능 검색 (Ctrl+K) — 기능 이름이나 관련 말을 치면 그 화면으로 이동하거나 창을 연다.
 */
export function CommandPalette({ commands }: { commands: Command[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const open = () => {
    setQuery("");
    setActive(0);
    dialogRef.current?.showModal();
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (dialogRef.current?.open) dialogRef.current.close();
        else open();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/\s+/g, "");
    if (!q) return commands;
    return commands.filter((c) => `${c.label} ${c.keywords}`.toLowerCase().replace(/\s+/g, "").includes(q) || c.keywords.split(/\s+/).some((k) => k && q.includes(k.toLowerCase())));
  }, [query, commands]);

  const choose = (c: Command | undefined) => {
    if (!c) return;
    dialogRef.current?.close();
    // 대화상자가 닫힌 다음에 이동·열기
    window.setTimeout(c.run, 30);
  };

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-haspopup="dialog"
        title="기능 검색 (Ctrl+K)"
        className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 [&>span]:hidden md:[&>span]:inline"
      >
        <Search className="h-3.5 w-3.5" aria-hidden />
        <span>검색</span>
        <span className="text-[10px] text-slate-400">Ctrl+K</span>
      </button>
      <dialog
        ref={dialogRef}
        aria-label="기능 검색"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="mx-auto mt-[12dvh] w-[calc(100%-2rem)] max-w-lg rounded-xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-900/40"
      >
        <div className="border-b border-slate-100 p-3">
          <input
            ref={inputRef}
            aria-label="기능 이름으로 찾기"
            value={query}
            placeholder="예) 환율, 체크리스트, 근교 투어, 영문"
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(results.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                choose(results[active]);
              }
            }}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <ul role="listbox" aria-label="찾은 기능" className="max-h-[50dvh] overflow-y-auto p-1.5">
          {results.length === 0 && <li className="px-3 py-4 text-center text-xs text-slate-500">찾는 기능이 없습니다.</li>}
          {results.map((c, i) => (
            <li key={`${c.group}-${c.label}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(c)}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${i === active ? "bg-indigo-50 text-indigo-900" : "text-slate-700"}`}
              >
                <span className="w-8 shrink-0 text-[10px] text-slate-400">{c.group}</span>
                {c.label}
              </button>
            </li>
          ))}
        </ul>
      </dialog>
    </>
  );
}
