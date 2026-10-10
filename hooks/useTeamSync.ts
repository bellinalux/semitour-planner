"use client";

import { useEffect, useState } from "react";
import { fetchTeam, mergeTeamData, onTeamChange, putTeam, readTeamLocal, writeTeamLocal, type TeamKind } from "@/lib/teamSync";

export type TeamSyncStatus = "loading" | "cloud" | "local";

const KINDS: TeamKind[] = ["defaults", "cost-memory", "segments"];
const PUSH_DELAY_MS = 1500;

/**
 * 화면을 열 때 서버의 팀 공용 데이터(회사 기본값, 원가 기억, 코스 조각)를 받아 브라우저 값과 합치고,
 * 이후 브라우저에서 바뀌면 잠시 모았다가 서버에 올린다. 서버 저장을 못 쓰면 브라우저에만 남는다(status = "local").
 */
export function useTeamSync(): TeamSyncStatus {
  const [status, setStatus] = useState<TeamSyncStatus>("loading");

  useEffect(() => {
    let cancelled = false;
    let cloud = false;
    const timers = new Map<TeamKind, number>();

    void (async () => {
      const results = await Promise.all(KINDS.map(async (kind) => ({ kind, server: await fetchTeam(kind) })));
      if (cancelled) return;
      cloud = results.every((r) => r.server !== undefined);
      setStatus(cloud ? "cloud" : "local");
      if (!cloud) return;
      for (const { kind, server } of results) {
        const { merged, pushBack } = mergeTeamData(kind, readTeamLocal(kind), server);
        writeTeamLocal(kind, merged);
        if (pushBack) void putTeam(kind, merged);
      }
    })();

    const off = onTeamChange((kind) => {
      if (!cloud) return;
      window.clearTimeout(timers.get(kind));
      timers.set(kind, window.setTimeout(() => void putTeam(kind, readTeamLocal(kind)), PUSH_DELAY_MS));
    });

    return () => {
      cancelled = true;
      off();
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  return status;
}
