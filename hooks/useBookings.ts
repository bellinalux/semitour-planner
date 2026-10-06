"use client";

import { useCallback, useState } from "react";
import { parseBooking, withHistory, type Booking } from "@/lib/bookings";

const LOCAL_KEY = "semitour-planner:bookings:v1";

export type BookingView = Booking & { canDelete?: boolean };

function readLocal(): Booking[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const list = raw ? (JSON.parse(raw) as unknown[]) : [];
    return Array.isArray(list) ? list.map(parseBooking).filter((b): b is Booking => b !== null) : [];
  } catch {
    return [];
  }
}

function writeLocal(list: Booking[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
  } catch {
    // 저장소를 쓸 수 없으면 이번 화면에서만 유지된다
  }
}

/** 예약 목록. 서버 저장을 쓸 수 있으면 팀 공용, 아니면 이 브라우저에만 저장한다 */
export function useBookings(author: string) {
  const [list, setList] = useState<BookingView[] | null>(null);
  const [cloud, setCloud] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/bookings");
      if (res.ok) {
        setCloud(true);
        setList(((await res.json()) as { bookings: BookingView[] }).bookings);
        return;
      }
    } catch {
      // 서버를 못 쓰면 브라우저 저장으로
    }
    setCloud(false);
    setList(readLocal());
  }, []);

  /** 추가·수정. 실패하면 오류 문장 */
  const save = async (booking: Booking): Promise<string | null> => {
    setError(null);
    if (cloud) {
      try {
        const res = await fetch("/api/bookings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ booking }) });
        const data = (await res.json().catch(() => null)) as { booking?: BookingView; error?: { message?: string } } | null;
        if (!res.ok || !data?.booking) return data?.error?.message ?? "저장하지 못했습니다.";
        const saved = data.booking;
        setList((prev) => (prev?.some((b) => b.id === saved.id) ? prev.map((b) => (b.id === saved.id ? saved : b)) : [saved, ...(prev ?? [])]));
        return null;
      } catch {
        return "서버에 연결하지 못했습니다.";
      }
    }
    const current = readLocal();
    const prev = current.find((b) => b.id === booking.id) ?? null;
    const saved = withHistory(prev, booking, author || "이 브라우저");
    const next = prev ? current.map((b) => (b.id === saved.id ? saved : b)) : [saved, ...current];
    writeLocal(next);
    setList(next);
    return null;
  };

  const remove = async (id: string): Promise<string | null> => {
    if (cloud) {
      const res = await fetch(`/api/bookings?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
      if (!res?.ok) {
        const data = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
        return data?.error?.message ?? "삭제하지 못했습니다.";
      }
    } else writeLocal(readLocal().filter((b) => b.id !== id));
    setList((prev) => prev?.filter((b) => b.id !== id) ?? null);
    return null;
  };

  return { list, cloud, error, refresh, save, remove };
}
