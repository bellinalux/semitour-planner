"use client";

import { Check, CircleAlert } from "lucide-react";
import { useEffect } from "react";
import type { FlightOption, TripInput } from "@/types";
import { ChannelSection } from "./ChannelSection";
import { CompetitorSection } from "./CompetitorSection";
import { CostSection } from "./CostSection";
import { DocumentSection } from "./DocumentSection";
import { PackageSection } from "./PackageSection";
import { PricingSection } from "./PricingSection";

/** 설정 패널의 항목. 견적 경고 등 다른 화면에서 이 항목으로 바로 이동시킬 때 쓴다 */
export type SettingsSection = "package" | "cost" | "pricing" | "channels" | "competitors" | "documents";

export interface SettingsFocus {
  section: SettingsSection;
  /** 같은 항목을 다시 눌러도 이동하도록 매번 바뀌는 값 */
  n: number;
}

interface Props {
  input: TripInput;
  onChange: (patch: Partial<TripInput>) => void;
  /** 일정에서 센 도시별 숙박 수 (도시별 숙박 요금 입력용) */
  stays: { city: string; nights: number }[];
  onApplyFlight: (flight: FlightOption) => void;
  focus: SettingsFocus | null;
  onFocus: (section: SettingsSection) => void;
}

interface CheckItem {
  section: SettingsSection;
  label: string;
  done: boolean;
}

/** 코스를 만든 뒤 견적에 꼭 필요한 값들이 채워졌는지 */
function checklist(input: TripInput): CheckItem[] {
  const items: CheckItem[] = [{ section: "cost", label: "차량·가이드비", done: input.vehicleCostPerDay + input.guideCostPerDay > 0 }];
  if (input.packageType !== "land") items.push({ section: "package", label: "숙박 요금", done: input.lodgingRatePerNight > 0 || Object.values(input.lodgingCityRates).some((v) => v > 0) });
  if (input.packageType === "full") items.push({ section: "package", label: "항공료", done: input.flightPricePerPerson > 0 });
  items.push({ section: "documents", label: "수신처", done: input.customerName.trim() !== "" });
  return items;
}

/**
 * 레이아웃3: 코스를 만든 뒤 원가·가격·판매 채널·경쟁사·고객 문서를 설정하는 패널.
 * 길어지는 항목은 접고 펼 수 있고, 접어도 입력값은 그대로 남는다.
 */
export function SettingsPanel({ input, onChange, stays, onApplyFlight, focus, onFocus }: Props) {
  const signal = (section: SettingsSection) => (focus?.section === section ? focus.n : undefined);

  useEffect(() => {
    if (!focus) return;
    const id = window.setTimeout(() => document.getElementById(`settings-${focus.section}`)?.scrollIntoView({ block: "start", behavior: "smooth" }), 60);
    return () => window.clearTimeout(id);
  }, [focus]);

  const items = checklist(input);

  return (
    <div className="space-y-4 p-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">설정</h2>
        <p className="mt-0.5 text-xs leading-4 text-slate-500">
          코스를 만든 뒤 원가·가격·판매 채널·경쟁사·고객 문서를 여기서 정합니다. 값을 바꾸면 견적이 바로 다시 계산됩니다.
        </p>
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="필수 설정 확인">
          {items.map((item) => (
            <li key={item.label}>
              <button
                type="button"
                onClick={() => onFocus(item.section)}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                  item.done
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    : "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                }`}
              >
                {item.done ? <Check className="h-3 w-3" aria-hidden /> : <CircleAlert className="h-3 w-3" aria-hidden />}
                {item.label} {item.done ? "입력됨" : "입력 필요"}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <PackageSection input={input} onChange={onChange} stays={stays} onApplyFlight={onApplyFlight} openSignal={signal("package")} />
      <CostSection input={input} onChange={onChange} openSignal={signal("cost")} />
      <PricingSection input={input} onChange={onChange} openSignal={signal("pricing")} />
      <ChannelSection input={input} onChange={onChange} openSignal={signal("channels")} />
      <CompetitorSection input={input} onChange={onChange} openSignal={signal("competitors")} />
      <DocumentSection input={input} onChange={onChange} openSignal={signal("documents")} />
    </div>
  );
}
