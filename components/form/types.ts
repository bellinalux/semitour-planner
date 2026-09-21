import type { TripInput } from "@/types";

export interface SectionProps {
  input: TripInput;
  onChange: (patch: Partial<TripInput>) => void;
}
