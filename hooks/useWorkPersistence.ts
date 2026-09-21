"use client";

import { useEffect, useRef } from "react";
import { parseResultSnapshot, type ResultSnapshot } from "@/lib/workspace";

const WORK_KEY = "semitour-planner:work:v1";

function readWork(): ResultSnapshot | null {
  try {
    const raw = localStorage.getItem(WORK_KEY);
    return raw ? parseResultSnapshot(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeWork(result: ResultSnapshot | null) {
  try {
    if (result === null) localStorage.removeItem(WORK_KEY);
    else localStorage.setItem(WORK_KEY, JSON.stringify(result));
  } catch {
    // 저장 공간이 없으면 자동 보관만 건너뛴다 (이름 붙여 저장할 때는 오류를 알려준다)
  }
}

/**
 * 작업 중인 결과(일정·견적 조정·세일즈 포인트)를 새로고침해도 유지한다.
 * 입력 폼은 usePlannerInput이 따로 저장하므로 여기서는 생성된 결과만 다룬다.
 *
 * 처음 한 번 저장된 값을 복원하고, 그 뒤로는 결과가 바뀔 때마다 자동 저장한다.
 */
export function useWorkPersistence(result: ResultSnapshot, onRestore: (saved: ResultSnapshot) => void) {
  /** 마운트 직후의 첫 저장 시도는 건너뛴다 (복원된 값이 화면에 반영되기 전 빈 상태로 덮어쓰지 않도록) */
  const armedRef = useRef(false);

  useEffect(() => {
    const saved = readWork();
    if (saved && saved.days.length > 0) onRestore(saved);
    // 마운트할 때 한 번만 복원한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { days, pmChoice, meta, generatedCurrency, usps, uspKey } = result;
  useEffect(() => {
    if (!armedRef.current) {
      armedRef.current = true;
      return;
    }
    writeWork(days.length > 0 ? { days, pmChoice, meta, generatedCurrency, usps, uspKey } : null);
  }, [days, pmChoice, meta, generatedCurrency, usps, uspKey]);
}
