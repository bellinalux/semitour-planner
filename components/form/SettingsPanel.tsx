"use client";

import { Check, CircleAlert, Save } from "lucide-react";
import { useEffect, useState } from "react";
import type { AutoQuote } from "@/hooks/useAutoQuote";
import { fillFromMemory, recallCosts } from "@/lib/costMemory";
import { clearPricingDefaults, DEFAULT_LABELS, pricingDefaultsSavedAt, savePricingDefaults } from "@/lib/pricingDefaults";
import type { FlightOption, TripInput } from "@/types";
import { AutoQuotePanel } from "./AutoQuotePanel";
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
  auto: AutoQuote;
}

/** 지금 가격 설정을 회사 기본값으로 저장해, 새 견적·초기화 때 자동으로 들어가게 한다 (이 브라우저에 저장) */
function DefaultsBar({ input }: { input: TripInput }) {
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    // 저장 시각은 브라우저 저장소에서만 읽을 수 있어 마운트 뒤에 가져온다
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 외부 저장소(localStorage) 값을 처음 한 번 동기화
    setSavedAt(pricingDefaultsSavedAt());
    setLoaded(true);
  }, []);

  return (
    <div className="space-y-1.5 border-t border-slate-100 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            savePricingDefaults(input);
            setSavedAt(new Date().toISOString());
          }}
          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
        >
          <Save className="h-3.5 w-3.5" aria-hidden />
          지금 설정을 회사 기본값으로 저장
        </button>
        {loaded && savedAt && (
          <button
            type="button"
            onClick={() => {
              clearPricingDefaults();
              setSavedAt(null);
            }}
            className="text-[11px] text-slate-500 underline underline-offset-2 hover:text-slate-700"
          >
            기본값 지우기
          </button>
        )}
      </div>
      <p className="text-[11px] leading-4 text-slate-500">
        {loaded && savedAt ? `기본값 저장됨 (${savedAt.slice(0, 10)}). ` : ""}
        {DEFAULT_LABELS}을 새 견적과 초기화 때 자동으로 넣습니다 (이 브라우저에 저장).
      </p>
    </div>
  );
}

/** 이 여행지로 지난 견적에서 쓴 원가가 있으면 비어 있는 칸에 불러올 수 있게 알려 준다 */
function MemoryHint({ input, onChange }: { input: TripInput; onChange: (patch: Partial<TripInput>) => void }) {
  const [, force] = useState(0);
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- 브라우저 저장소는 마운트 뒤에만 읽는다
  useEffect(() => setMounted(true), []);
  if (!mounted || !input.destination.trim()) return null;
  const entry = recallCosts(input.destination, input.currency);
  const fill = entry ? fillFromMemory(input) : null;
  if (!entry || !fill) return null;
  return (
    <p className="flex flex-wrap items-center gap-1.5 rounded-md bg-indigo-50 px-2.5 py-2 text-[11px] leading-4 text-indigo-900">
      지난 &quot;{entry.destination}&quot; 견적({entry.savedAt.slice(0, 10)})에서 쓴 {fill.applied.join(", ")} 값이 있습니다.
      <button
        type="button"
        onClick={() => {
          onChange(fill.patch);
          force((n) => n + 1);
        }}
        className="font-semibold underline underline-offset-2"
      >
        비어 있는 칸에 불러오기
      </button>
    </p>
  );
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
export function SettingsPanel({ input, onChange, stays, onApplyFlight, focus, onFocus, auto }: Props) {
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
        <div className="mt-3">
          <AutoQuotePanel auto={auto} />
        </div>
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
        <div className="mt-3 space-y-2">
          <MemoryHint input={input} onChange={onChange} />
          <DefaultsBar input={input} />
        </div>
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
