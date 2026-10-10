"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * 운영 기능 보기 — 이 앱의 목적은 패키지·투어 코스 만들기라서, 출발 뒤 운영 기능(예약 관리, 출발 준비·수배·명단·정산·가이드 링크,
 * 출발 전 안내문)은 기본으로 숨긴다. 더보기에서 켜면 다시 보인다 (이 브라우저에 기억, 코드는 그대로).
 */
const KEY = "semitour-planner:showOps";
const EVENT = "semitour:show-ops";

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function useShowOps(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, read, () => false);
  const set = useCallback((v: boolean) => {
    try {
      localStorage.setItem(KEY, v ? "1" : "0");
    } catch {
      /* 무시 */
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [on, set];
}
