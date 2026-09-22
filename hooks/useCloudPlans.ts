"use client";

import { useCallback, useState } from "react";
import type { PlanIndexEntry, PlanSnapshot, SavedPlan } from "@/lib/workspace";

export type CloudStatus = "idle" | "loading" | "ready" | "unavailable" | "error";

interface ApiError {
  error?: { code?: string; message?: string };
}

async function call<T>(url: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; code: string; message: string; status: number }> {
  try {
    const res = await fetch(url, init);
    const data = (await res.json().catch(() => null)) as (T & ApiError) | null;
    if (!res.ok) {
      return { ok: false, status: res.status, code: data?.error?.code ?? "ERROR", message: data?.error?.message ?? `요청에 실패했습니다. (${res.status})` };
    }
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, status: 0, code: "NETWORK", message: "서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요." };
  }
}

/**
 * 서버 저장(모든 기기에서 보이는 일정 보관함).
 * 접속 코드가 꺼져 있거나 저장소가 연결되지 않았으면 status가 "unavailable"이고 reason에 이유가 담긴다.
 */
export function useCloudPlans() {
  const [status, setStatus] = useState<CloudStatus>("idle");
  const [reason, setReason] = useState("");
  const [plans, setPlans] = useState<PlanIndexEntry[]>([]);

  const refresh = useCallback(async () => {
    setStatus("loading");
    const res = await call<{ plans: PlanIndexEntry[] }>("/api/plans");
    if (res.ok) {
      setPlans(res.data.plans);
      setStatus("ready");
      return;
    }
    setReason(res.message);
    setStatus(res.code === "CLOUD_DISABLED" || res.code === "NO_STORE" ? "unavailable" : "error");
  }, []);

  /** 저장(같은 id면 덮어쓰기). 성공하면 null, 실패하면 오류 문장 */
  const save = useCallback(async (id: string, name: string, snapshot: PlanSnapshot): Promise<string | null> => {
    const res = await call<{ entry: PlanIndexEntry }>("/api/plans", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name, snapshot }),
    });
    if (!res.ok) return res.message;
    const { entry } = res.data;
    setPlans((prev) => [entry, ...prev.filter((p) => p.id !== entry.id)]);
    return null;
  }, []);

  const remove = useCallback(async (id: string): Promise<string | null> => {
    const res = await call<{ ok: true }>(`/api/plans?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) return res.message;
    setPlans((prev) => prev.filter((p) => p.id !== id));
    return null;
  }, []);

  const fetchPlan = useCallback(async (id: string): Promise<{ plan: SavedPlan } | { error: string }> => {
    const res = await call<{ plan: SavedPlan }>(`/api/plans?id=${encodeURIComponent(id)}`);
    return res.ok ? { plan: res.data.plan } : { error: res.message };
  }, []);

  return { status, reason, plans, refresh, save, remove, fetchPlan };
}
