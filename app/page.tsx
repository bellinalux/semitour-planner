import { AccessGate } from "@/components/AccessGate";
import { PlannerApp } from "@/components/PlannerApp";

export default function Page() {
  return (
    <AccessGate>
      <PlannerApp />
    </AccessGate>
  );
}
