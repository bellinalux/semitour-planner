"use client";

import { createContext, useContext } from "react";

export type UserRole = "admin" | "staff";

export interface SessionUser {
  name: string;
  role: UserRole;
  /** 공용 관리자 접속 코드로 들어온 경우 */
  isMaster: boolean;
}

export interface SessionInfo {
  /** 로그인한 사람. 잠금이 꺼진 환경(로컬 개발)이면 null */
  user: SessionUser | null;
  /** 직원 계정을 쓸 수 있는지 (접속 코드 + 서버 저장소가 있어야 한다) */
  accounts: boolean;
  /** 관리자 권한인지. 잠금이 꺼진 환경은 모두 관리자로 본다 */
  isAdmin: boolean;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionInfo>({ user: null, accounts: false, isAdmin: true, logout: async () => undefined });

export const SessionProvider = SessionContext.Provider;

/** 지금 로그인한 사람과 권한 (AccessGate 안에서만 의미가 있다) */
export function useSession(): SessionInfo {
  return useContext(SessionContext);
}
