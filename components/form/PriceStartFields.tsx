"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { ChoiceGroup } from "@/components/ui/ChoiceGroup";
import { NumberField } from "@/components/ui/NumberField";
import { budgetPlan } from "@/lib/budget";
import { DIRECT_CHANNEL_ID } from "@/lib/channels";
import { currencySymbol, formatMoney } from "@/lib/currency";
import { createChannel } from "@/lib/defaults";
import type { PricingMode } from "@/types";
import type { SectionProps } from "./types";

export const PRICE_START_MODES: { id: PricingMode; label: string; hint: string }[] = [
  { id: "target_margin", label: "원가에서 시작", hint: "원가 + 회사 수익 → 권장 판매가" },
  { id: "fixed_price", label: "판매가에서 시작", hint: "판매가 − 수수료·수익 → 원가 예산 안에서 구성" },
  { id: "wholesale", label: "B2B 도매가에서 시작", hint: "거래처에 넘길 가격 − 수익 → 원가 예산" },
  { id: "supplier", label: "랜드사 공급가에서 시작", hint: "공급가 + 회사 수익 → 판매가" },
];

/** 견적 시작 방법 고르기 + 그 방법에 필요한 가격 입력 + (판매가·도매가) 원가 예산 계산 */
export function PriceStartFields({ input, onChange }: SectionProps) {
  const symbol = currencySymbol(input.currency);
  const money = (v: number) => formatMoney(v, input.currency);
  const plan = budgetPlan(input, null);
  const [newPlatform, setNewPlatform] = useState({ name: "", rate: 0 });

  const addPlatform = () => {
    const name = newPlatform.name.trim();
    if (!name) return;
    const channel = { ...createChannel(), name, commissionRate: newPlatform.rate };
    onChange({ channels: [...input.channels, channel], documentChannelId: channel.id });
    setNewPlatform({ name: "", rate: 0 });
  };

  return (
    <div className="space-y-3">
      <ChoiceGroup name="pricingMode" label="견적 시작 방법" value={input.pricingMode} options={PRICE_START_MODES} onChange={(pricingMode) => onChange({ pricingMode })} />
      <p className="text-pretty text-[11px] leading-4 text-slate-500">모든 1인 가격은 2인 1실 기준입니다. 혼자 방을 쓰면 싱글차지를 따로 받습니다.</p>

      {input.pricingMode === "fixed_price" && (
        <div className="space-y-3 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
          <NumberField
            id="fixedPricePerPerson"
            label="1인 판매가 (2인 1실 기준)"
            value={input.fixedPricePerPerson}
            prefix={symbol}
            hint="고객이 내는 가격입니다. 여기서 수수료·회사 수익을 뺀 금액이 원가 예산이 됩니다."
            onChange={(fixedPricePerPerson) => onChange({ fixedPricePerPerson })}
          />
          <div>
            <label htmlFor="salesPlatform" className="mb-1 block text-xs font-medium text-slate-700">
              판매 플랫폼 (수수료)
            </label>
            <select
              id="salesPlatform"
              value={input.documentChannelId || DIRECT_CHANNEL_ID}
              onChange={(e) => onChange({ documentChannelId: e.target.value === DIRECT_CHANNEL_ID ? "" : e.target.value })}
              className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
            >
              <option value={DIRECT_CHANNEL_ID}>직판 (카드 수수료 {input.cardFeeRate}%)</option>
              {input.channels
                .filter((c) => c.name.trim())
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} (수수료 {c.commissionRate}%{c.paymentFeeSeparate ? ` + 카드 ${input.cardFeeRate}%` : ""})
                  </option>
                ))}
            </select>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="grid gap-1">
                <span className="text-[11px] text-slate-500">플랫폼 추가</span>
                <input
                  value={newPlatform.name}
                  onChange={(e) => setNewPlatform({ ...newPlatform, name: e.target.value })}
                  placeholder="예: 클룩"
                  className="w-28 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-[11px] text-slate-500">수수료 %</span>
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={newPlatform.rate}
                  onChange={(e) => setNewPlatform({ ...newPlatform, rate: Math.max(0, Number(e.target.value) || 0) })}
                  className="w-16 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs tabular-nums"
                />
              </label>
              <button
                type="button"
                onClick={addPlatform}
                disabled={!newPlatform.name.trim()}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                추가
              </button>
            </div>
            <p className="mt-1 text-[11px] leading-4 text-slate-500">수수료는 계약한 값을 직접 넣어 주세요. 아래 &apos;판매 채널&apos;에서 고칠 수 있습니다.</p>
          </div>
        </div>
      )}

      {input.pricingMode === "wholesale" && (
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
          <NumberField
            id="wholesalePricePerPerson"
            label="거래처 도매가 (1인, 2인 1실)"
            value={input.wholesalePricePerPerson}
            prefix={symbol}
            hint="다른 여행사에 넘기는 가격. 플랫폼·카드 수수료 없이 회사 수익만 뺍니다."
            onChange={(wholesalePricePerPerson) => onChange({ wholesalePricePerPerson })}
          />
          <NumberField
            id="partnerMarginRate"
            label="거래처 마진율"
            value={input.partnerMarginRate}
            suffix="%"
            max={80}
            hint="거래처가 소비자에게 팔 권장가 계산용"
            onChange={(partnerMarginRate) => onChange({ partnerMarginRate })}
          />
        </div>
      )}

      {input.pricingMode === "supplier" && (
        <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
          <NumberField
            id="supplierPricePerPerson"
            label="랜드사 공급가 (1인, 2인 1실 기준)"
            value={input.supplierPricePerPerson}
            prefix={symbol}
            hint="숙박·차량·가이드·입장료·식사가 들어 있는 금액으로 계산합니다. 항공·팁·보험·기타 고정비는 따로 더합니다."
            onChange={(supplierPricePerPerson) => onChange({ supplierPricePerPerson })}
          />
        </div>
      )}

      {plan && (
        <div className="space-y-1 rounded-lg bg-slate-900 px-3 py-2.5 text-[11px] leading-5 text-slate-100" aria-label="원가 예산 계산">
          <div className="flex justify-between">
            <span>{plan.mode === "wholesale" ? "거래처 도매가" : "1인 판매가"}</span>
            <span className="tabular-nums">{money(plan.pricePerPerson)}</span>
          </div>
          {plan.feePerPerson > 0 && (
            <div className="flex justify-between text-slate-300">
              <span>
                − {plan.channelName} 수수료 {(plan.feeRate * 100).toFixed(1)}%
              </span>
              <span className="tabular-nums">−{money(plan.feePerPerson)}</span>
            </div>
          )}
          <div className="flex justify-between text-slate-300">
            <span>− 회사 수익 {(plan.marginRate * 100).toFixed(0)}%</span>
            <span className="tabular-nums">−{money(plan.profitPerPerson)}</span>
          </div>
          <div className="flex justify-between border-t border-slate-700 pt-1 text-sm font-semibold">
            <span>= 1인 원가 예산</span>
            <span className="tabular-nums">{money(plan.budgetPerPerson)}</span>
          </div>
          {plan.caps.roomPerNight !== null && (
            <p className="text-slate-300">→ 숙소는 1실 1박 {money(plan.caps.roomPerNight)} 이하 (2인 1실)로 찾습니다</p>
          )}
        </div>
      )}
    </div>
  );
}
