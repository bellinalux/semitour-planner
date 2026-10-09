import type { TripInput } from "@/types";

export interface SectionProps {
  input: TripInput;
  onChange: (patch: Partial<TripInput>) => void;
  /** 다른 화면에서 이 항목으로 이동시킬 때 올라가는 신호. 접혀 있어도 펼친다 */
  openSignal?: number;
}
