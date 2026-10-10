"use client";

import { BookOpen, X } from "lucide-react";
import { useEffect, useRef } from "react";

const SEEN_KEY = "semitour-planner:welcomeSeen";

const STEPS: { title: string; body: string }[] = [
  { title: "① 입력", body: "왼쪽에 여행지·기간·인원을 넣고 「자동 구성」을 누르면 코스 → 숙소 → 차량·가이드·입장료 시세 → 경쟁 상품까지 한 번에 채웁니다. 업체 견적서(워드·PDF)가 있으면 「업체 코스·견적」에 올리세요." },
  { title: "② 검증", body: "업체 견적서를 올리면 「한 번에 검증」이 시세·시간·코스 점검·타업체 비교를 차례로 돌립니다. 일정 카드의 점수 배지와 오른쪽 「요약·추천」에서 고칠 것을 버튼 하나로 적용합니다." },
  { title: "③ 가격", body: "견적 화면에서 「가격 낮추기」로 경쟁 상품보다 싸게 만드는 방법을 보고, 「고객 제시용 가격」에서 A/B/C안·인원별 요금표를 만듭니다." },
  { title: "④ 문서", body: "맨 아래 「문서 인쇄」에서 견적서·비교 견적서·일정표·계약서와 현지용 운영 지시서(예약 확인 체크리스트 포함)를 PDF로 저장합니다." },
  { title: "⑤ 그 밖에", body: "상단 「근교 투어」로 반일·당일 투어 원가·판매가를, 「예약 관리」로 입금·기한을, 더보기의 「이력·백업」에서 견적 성과(성약률)를 봅니다." },
];

/** 처음 사용 안내 — 첫 방문에 한 번 자동으로 열고, 더보기의 [사용 안내]로 다시 연다 */
export function WelcomeGuide() {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    try {
      if (!localStorage.getItem(SEEN_KEY)) dialogRef.current?.showModal();
    } catch {
      /* 저장소를 못 쓰면 자동으로 열지 않는다 */
    }
  }, []);

  const close = () => {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* 다음에 다시 열려도 괜찮다 */
    }
    dialogRef.current?.close();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        aria-haspopup="dialog"
        className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        <BookOpen className="h-3.5 w-3.5" aria-hidden />
        사용 안내
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="welcome-title"
        onClose={close}
        onClick={(e) => {
          if (e.target === dialogRef.current) close();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-900/40"
      >
        <div className="flex max-h-[85dvh] flex-col">
          <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 id="welcome-title" className="text-sm font-semibold text-slate-900">
              세미투어 플래너 사용 안내
            </h2>
            <button type="button" onClick={close} aria-label="닫기" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </header>
          <ol className="space-y-2.5 overflow-y-auto p-4 text-xs leading-5">
            {STEPS.map((s) => (
              <li key={s.title}>
                <p className="font-semibold text-indigo-800">{s.title}</p>
                <p className="text-pretty text-slate-600">{s.body}</p>
              </li>
            ))}
          </ol>
          <footer className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
            <span className="text-[11px] text-slate-400">더보기 → 사용 안내에서 다시 볼 수 있습니다.</span>
            <button type="button" onClick={close} className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700">
              시작하기
            </button>
          </footer>
        </div>
      </dialog>
    </>
  );
}
