import type { TripInput } from "@/types";

/** 입력 폴더 안에서 이동할 구역 */
export type SetupSection = "package" | "cost" | "pricing" | "channels" | "competitors" | "documents";

export interface CheckItem {
  section: SetupSection;
  label: string;
  done: boolean;
}

/** 코스를 만든 뒤 견적에 꼭 필요한 값들이 채워졌는지 */
export function setupChecklist(input: TripInput): CheckItem[] {
  const items: CheckItem[] = [{ section: "cost", label: "차량·가이드비", done: input.vehicleCostPerDay + input.guideCostPerDay > 0 }];
  if (input.packageType !== "land") items.push({ section: "package", label: "숙박 요금", done: input.lodgingRatePerNight > 0 || Object.values(input.lodgingCityRates).some((v) => v > 0) });
  if (input.packageType === "full") items.push({ section: "package", label: "항공료", done: input.flightPricePerPerson > 0 });
  items.push({ section: "documents", label: "수신처", done: input.customerName.trim() !== "" });
  return items;
}
