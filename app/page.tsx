import { PlannerApp } from "@/components/PlannerApp";
import type { AsyncState } from "@/types";

// 개발 중 로딩/에러 UI를 눈으로 확인하기 위한 임시 미리보기 (?preview=loading|error). Step 2에서 제거.
function previewStates(preview: string | undefined): { itinerary?: AsyncState; usp?: AsyncState } {
  if (process.env.NODE_ENV === "production") return {};
  if (preview === "loading") return { itinerary: { status: "loading" }, usp: { status: "loading" } };
  if (preview === "error") {
    return {
      itinerary: { status: "error", error: "AI 응답을 해석하지 못했습니다. (예시 오류)" },
      usp: { status: "error", error: "요청 시간이 초과되었습니다. (예시 오류)" },
    };
  }
  return {};
}

export default async function Page({ searchParams }: PageProps<"/">) {
  const { preview } = await searchParams;
  const states = previewStates(typeof preview === "string" ? preview : undefined);

  return <PlannerApp initialItinerary={states.itinerary} initialUsp={states.usp} />;
}
