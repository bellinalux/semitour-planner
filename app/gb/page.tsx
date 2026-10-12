import type { Metadata } from "next";
import { CityGuidePrint } from "./CityGuidePrint";

/** 도시별 가이드 교육 자료 인쇄 (/gb?city=방콕) — 직원만 (자료는 로그인한 사람에게만 내려온다) */

export const metadata: Metadata = { title: "가이드 교육 자료", robots: { index: false, follow: false } };

export default async function GuideBookPrintPage({ searchParams }: { searchParams: Promise<{ city?: string }> }) {
  const { city = "" } = await searchParams;
  return <CityGuidePrint city={city.slice(0, 60)} />;
}
