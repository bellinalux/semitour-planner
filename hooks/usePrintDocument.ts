"use client";

import { useCallback, useEffect, useState } from "react";
import type { DocKind } from "@/components/print/PrintDocuments";

/**
 * 문서를 골라 브라우저 인쇄(= PDF로 저장)로 넘긴다.
 * 문서가 화면에 그려진 다음에 인쇄창을 열어야 내용이 비지 않으므로, 한 프레임 뒤에 print를 부른다.
 */
export function usePrintDocument() {
  const [kind, setKind] = useState<DocKind | null>(null);

  useEffect(() => {
    if (kind === null) return;

    const done = () => setKind(null);
    window.addEventListener("afterprint", done);
    const timer = window.setTimeout(() => window.print(), 80);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", done);
    };
  }, [kind]);

  const print = useCallback((next: DocKind) => setKind(next), []);

  return { kind, print, printing: kind !== null };
}
