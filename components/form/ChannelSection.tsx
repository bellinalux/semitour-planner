import { Plus, Store, Trash2 } from "lucide-react";
import { NumberField } from "@/components/ui/NumberField";
import { SectionCard } from "@/components/ui/SectionCard";
import { TextField } from "@/components/ui/TextField";
import { currencySymbol } from "@/lib/currency";
import { createChannel, MAX_CHANNELS } from "@/lib/defaults";
import type { ChannelPriceMode, SalesChannel } from "@/types";
import type { SectionProps } from "./types";

const PRESET_NAMES = ["클룩", "마이리얼트립", "스마트스토어", "Viator", "GetYourGuide"];

const PRICE_MODES: { id: ChannelPriceMode; label: string; hint: string }[] = [
  { id: "per_channel", label: "채널마다 목표 마진에 맞춤", hint: "채널마다 판매가가 달라질 수 있습니다" },
  { id: "parity", label: "모든 채널 같은 가격", hint: "수수료가 가장 큰 채널 기준으로 직판가까지 올립니다" },
];

/**
 * 직판 외에 파는 플랫폼의 수수료를 직접 입력한다. 수수료율은 업체와 계약한 값으로 입력하세요
 * (공개 요율이 없거나 협상으로 달라지는 채널이 많아 기본값을 넣어 두지 않습니다).
 */
export function ChannelSection({ input, onChange }: SectionProps) {
  const { channels } = input;
  const canAdd = channels.length < MAX_CHANNELS;
  const channelShare = channels.reduce((sum, c) => sum + Math.max(0, c.share), 0);

  const replace = (id: string, patch: Partial<SalesChannel>) =>
    onChange({ channels: channels.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const remove = (id: string) =>
    onChange({
      channels: channels.filter((c) => c.id !== id),
      documentChannelId: input.documentChannelId === id ? "" : input.documentChannelId,
    });
  const add = (name = "") => onChange({ channels: [...channels, { ...createChannel(), name }] });

  return (
    <SectionCard
      title="판매 채널·수수료"
      description="플랫폼 수수료까지 반영해 채널별 판매가와 정산액을 계산합니다"
      icon={Store}
      action={
        <button
          type="button"
          onClick={() => add()}
          disabled={!canAdd}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          채널 추가
        </button>
      }
    >
      <div className="space-y-4">
        <p className="text-[11px] leading-4 text-slate-500">
          직판(자사·카드결제)은 항상 기본으로 계산됩니다. 다른 플랫폼에서도 파는 상품이면 채널을 추가하고, 계약한 수수료율을 직접 입력하세요.
        </p>

        {channels.length === 0 && (
          <div className="flex flex-wrap gap-1.5" aria-label="채널 빠른 추가">
            {PRESET_NAMES.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => add(name)}
                className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:border-indigo-300 hover:text-indigo-700"
              >
                + {name}
              </button>
            ))}
          </div>
        )}

        {channels.map((channel, index) => {
          const id = `channel-${channel.id}`;
          return (
            <div key={channel.id} className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600">채널 {index + 1}</span>
                <button
                  type="button"
                  onClick={() => remove(channel.id)}
                  aria-label={`채널 ${index + 1} 삭제`}
                  className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <div className="space-y-3">
                <TextField id={`${id}-name`} label="채널 이름" value={channel.name} placeholder="예) 클룩" onChange={(name) => replace(channel.id, { name })} />
                <div className="grid grid-cols-2 gap-3">
                  <NumberField
                    id={`${id}-rate`}
                    label="수수료율"
                    value={channel.commissionRate}
                    suffix="%"
                    max={90}
                    hint="판매가 대비"
                    onChange={(commissionRate) => replace(channel.id, { commissionRate })}
                  />
                  <NumberField
                    id={`${id}-fixed`}
                    label="1인 정액 수수료"
                    value={channel.fixedFeePerPerson}
                    prefix={currencySymbol(input.currency)}
                    hint="없으면 0"
                    onChange={(fixedFeePerPerson) => replace(channel.id, { fixedFeePerPerson })}
                  />
                </div>
                <div className="grid grid-cols-2 items-end gap-3">
                  <NumberField
                    id={`${id}-share`}
                    label="예상 판매 비중"
                    value={channel.share}
                    suffix="%"
                    max={100}
                    hint="전체 판매 중 이 채널 비율"
                    onChange={(share) => replace(channel.id, { share })}
                  />
                  <label className="flex items-start gap-1.5 pb-2 text-[11px] leading-4 text-slate-600">
                    <input
                      type="checkbox"
                      checked={channel.paymentFeeSeparate}
                      onChange={(e) => replace(channel.id, { paymentFeeSeparate: e.target.checked })}
                      className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>
                      카드 결제 수수료를 따로 냄
                      <span className="block text-slate-400">체크 안 하면 수수료율에 결제 수수료가 포함된 것으로 봅니다</span>
                    </span>
                  </label>
                </div>
              </div>
            </div>
          );
        })}

        {channels.length > 0 && (
          <>
            <p className={`text-[11px] leading-4 ${channelShare > 100 ? "font-medium text-red-600" : "text-slate-500"}`}>
              판매 비중: 직판 {Math.max(0, 100 - channelShare)}% + 채널 {channelShare}%
              {channelShare > 100 ? " — 채널 비중 합계가 100%를 넘었습니다. 계산은 비율대로 맞춰서 합니다." : ""}
            </p>

            <div>
              <span className="mb-1.5 block text-xs font-medium text-slate-700">채널 가격 정책</span>
              <div role="radiogroup" aria-label="채널 가격 정책" className="grid grid-cols-2 gap-2">
                {PRICE_MODES.map((mode) => {
                  const selected = input.channelPriceMode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => onChange({ channelPriceMode: mode.id })}
                      className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                        selected ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500" : "border-slate-200 bg-white hover:border-indigo-300"
                      }`}
                    >
                      <span className={`block text-xs font-semibold ${selected ? "text-indigo-800" : "text-slate-700"}`}>{mode.label}</span>
                      <span className="mt-0.5 block text-[10px] leading-3 text-slate-500">{mode.hint}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[11px] leading-4 text-slate-500">
                OTA는 대개 다른 채널보다 비싸게 팔지 못하게 하는 최저가(가격 패리티) 조건을 요구합니다. 계약 조건에 맞는 쪽을 고르세요.
              </p>
            </div>
          </>
        )}

        <NumberField
          id="minMarginRate"
          label="최소 마진율 (최저 판매가 계산용)"
          value={input.minMarginRate}
          suffix="%"
          min={0}
          max={90}
          hint="견적서의 '최저 판매가'가 이 마진을 지키는 가격입니다"
          onChange={(minMarginRate) => onChange({ minMarginRate })}
        />
      </div>
    </SectionCard>
  );
}
