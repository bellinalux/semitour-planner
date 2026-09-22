"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_COMPANY, normalizeCompany } from "@/lib/company";
import type { CompanyProfile } from "@/types";

const STORAGE_KEY = "semitour-planner:company:v1";

/** cloud: 서버에 저장되어 모든 기기에서 보임 / local: 이 브라우저에만 저장 */
export type CompanyStorage = "loading" | "cloud" | "local";

function readLocal(): CompanyProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeCompany(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeLocal(company: CompanyProfile) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(company));
  } catch {
    // 저장소를 쓸 수 없는 환경에서는 이번 화면에서만 유지된다
  }
}

/**
 * 회사 정보. 서버 저장을 쓸 수 있으면 서버 값을 쓰고(모든 기기 공용),
 * 쓸 수 없으면 이 브라우저에만 저장한다. 서버에 저장할 때도 로컬 사본을 함께 남긴다.
 */
export function useCompanyProfile() {
  const [company, setCompany] = useState<CompanyProfile>(DEFAULT_COMPANY);
  const [storage, setStorage] = useState<CompanyStorage>("loading");
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    void (async () => {
      // 로컬 사본을 먼저 띄우고, 서버 값이 있으면 그 값으로 바꾼다
      const local = readLocal();
      if (local) setCompany(local);
      try {
        const res = await fetch("/api/company");
        if (!res.ok) {
          setStorage("local");
          return;
        }
        const data = (await res.json()) as { company: CompanyProfile | null };
        if (data.company) setCompany(normalizeCompany(data.company));
        setStorage("cloud");
      } catch {
        setStorage("local");
      }
    })();
  }, []);

  /** 저장한다. 성공하면 null, 실패하면 오류 문장을 돌려준다. */
  const save = useCallback(
    async (next: CompanyProfile): Promise<string | null> => {
      const clean = normalizeCompany(next);
      setCompany(clean);
      writeLocal(clean);
      if (storage !== "cloud") return null;

      try {
        const res = await fetch("/api/company", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ company: clean }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
          return `${data?.error?.message ?? "서버에 저장하지 못했습니다."} (이 브라우저에는 저장했습니다)`;
        }
        return null;
      } catch {
        return "서버에 연결하지 못해 이 브라우저에만 저장했습니다.";
      }
    },
    [storage],
  );

  return { company, storage, save };
}
