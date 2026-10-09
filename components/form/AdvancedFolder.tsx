import { Settings2 } from "lucide-react";
import { SectionCard } from "@/components/ui/SectionCard";
import { ChannelSection } from "./ChannelSection";
import { CompetitorSection } from "./CompetitorSection";
import { DetailConditionsSection } from "./DetailConditionsSection";
import { PricingSection } from "./PricingSection";
import type { SettingsFocus } from "./settingsFocus";
import type { SectionProps } from "./types";

/**
 * 폴더 6. 고급 (선택) — 처음 쓰는 사람은 열 필요 없는 항목: AI 일정 상세 조건, 예비비·카드 수수료·아동 요금, 판매 채널 상세, 경쟁사.
 * 경쟁사는 자동 구성이 찾아 넣는다.
 */
export function AdvancedFolder({ input, onChange, focus }: SectionProps & { focus: SettingsFocus | null }) {
  const signal = (s: SettingsFocus["section"]) => (focus?.section === s ? focus.n : undefined);
  return (
    <SectionCard
      title="6. 고급 (선택)"
      description="처음에는 열지 않아도 됩니다"
      icon={Settings2}
      collapsible
      defaultOpen={false}
      openSignal={signal("channels") ?? signal("competitors")}
      summary={`판매 채널 ${input.channels.length}개 · 경쟁사 ${input.competitors.length}곳 · 예비비 ${input.contingencyRate}%`}
    >
      <div className="space-y-3">
        {input.mode !== "paste" && <DetailConditionsSection input={input} onChange={onChange} />}
        <PricingSection input={input} onChange={onChange} />
        <ChannelSection input={input} onChange={onChange} openSignal={signal("channels")} />
        <CompetitorSection input={input} onChange={onChange} openSignal={signal("competitors")} />
      </div>
    </SectionCard>
  );
}
