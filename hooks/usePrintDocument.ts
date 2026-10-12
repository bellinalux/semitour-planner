"use client";

import { useCallback, useEffect, useState } from "react";
import type { DocKind } from "@/components/print/PrintDocuments";

/**
 * 문서를 골라 브라우저 인쇄(= PDF로 저장)로 넘긴다.
 * 문서가 다 그려진 다음에 인쇄창을 연다 — 문서가 붙고, 지도 그림을 찍는 중인 것(data-print-pending)이 없고,
 * 그림(로고·사진·지도)이 다 불러와질 때까지 기다린다 (최대 12초). 그 전에 열면 빈 쪽·바탕 없는 지도가 나온다.
 */
const WAIT_MAX_MS = 12000;

export function documentReady(doc: Document = document): boolean {
  const root = doc.querySelector(".print-root");
  if (!root) return false;
  if (root.querySelector("[data-print-pending]")) return false;
  return Array.from(root.querySelectorAll("img")).every((img) => img.complete);
}

export function usePrintDocument() {
  const [kind, setKind] = useState<DocKind | null>(null);

  useEffect(() => {
    if (kind === null) return;

    const done = () => setKind(null);
    window.addEventListener("afterprint", done);
    const started = Date.now();
    let timer = 0;
    const tick = () => {
      if (documentReady() || Date.now() - started > WAIT_MAX_MS) window.print();
      else timer = window.setTimeout(tick, 150);
    };
    timer = window.setTimeout(tick, 80);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", done);
    };
  }, [kind]);

  const print = useCallback((next: DocKind) => setKind(next), []);

  return { kind, print, printing: kind !== null };
}
