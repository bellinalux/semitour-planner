"use client";

import { useSyncExternalStore } from "react";

/** CSS 미디어 쿼리가 맞는지 (서버에서는 false). 화면 너비에 따라 한 곳에만 그릴 때 쓴다 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
