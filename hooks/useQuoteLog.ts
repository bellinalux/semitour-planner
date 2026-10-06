"use client";

import { useCallback, useEffect, useState } from "react";
import { addToLog, isQuoteLogEntry, readAuthor, readLocalQuoteLog, writeAuthor, writeLocalQuoteLog, type QuoteLogEntry } from "@/lib/quoteLog";
import { fetchTeam } from "@/lib/teamSync";

/**
 * 견적 이력 목록과 작성자 이름. 서버 저장을 쓸 수 있으면 팀 공용 이력을 쓰고, 아니면 이 브라우저 이력을 쓴다.
 */
export function useQuoteLog() {
  const [entries, setEntries] = useState<QuoteLogEntry[]>([]);
  const [cloud, setCloud] = useState(false);
  const [author, setAuthorState] = useState("");

  const refresh = useCallback(async () => {
    const server = await fetchTeam("quote-log");
    if (server === undefined) {
      setCloud(false);
      setEntries(readLocalQuoteLog());
      return;
    }
    setCloud(true);
    setEntries(Array.isArray(server) ? server.filter(isQuoteLogEntry) : []);
  }, []);

  useEffect(() => {
    // 브라우저 저장소에서 읽는 값이라 화면을 그린 뒤에 불러온다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAuthorState(readAuthor());
    void refresh();
  }, [refresh]);

  const setAuthor = (name: string) => {
    setAuthorState(name);
    writeAuthor(name);
  };

  /** 한 건 기록. 서버가 있으면 서버에도 올린다 */
  const record = (entry: QuoteLogEntry) => {
    const next = addToLog(entries, entry);
    setEntries(next);
    if (!cloud) writeLocalQuoteLog(next);
    else void fetch("/api/team?kind=quote-log", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: next[0] }) }).catch(() => undefined);
  };

  return { entries, cloud, author, setAuthor, record, refresh };
}

export type QuoteLog = ReturnType<typeof useQuoteLog>;
