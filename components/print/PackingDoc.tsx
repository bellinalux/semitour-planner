import { tripPeriod } from "@/lib/documents";
import { packingList } from "@/lib/packingList";
import { DocSection, DocShell, type DocProps } from "./DocShell";

/** 고객용 준비물 체크리스트 — 날씨·전압·입국 조건·일정 내용에 맞춘 준비물 (한 장) */
export function PackingDoc({ input, days, pmChoice, meta, company, travelInfo, season }: DocProps) {
  const title = meta?.packageName?.trim() || `${input.destination} ${input.nights}박 ${input.days}일`;
  const groups = packingList(input, days, pmChoice, travelInfo, season);
  return (
    <DocShell title="준비물 체크리스트" subtitle={`${title} · ${tripPeriod(input)}`} company={company}>
      {groups.map((g) => (
        <DocSection key={g.title} title={g.title}>
          <ul className="grid gap-1 sm:grid-cols-2">
            {g.items.map((i) => (
              <li key={i} className="flex gap-1.5">
                <span aria-hidden>☐</span>
                {i}
              </li>
            ))}
          </ul>
        </DocSection>
      ))}
      {(travelInfo?.weather || season?.weather) && <p className="text-slate-600">날씨: {season?.weather || travelInfo?.weather}</p>}
      <p className="mt-2 text-[10px] text-slate-500">보조배터리는 기내 반입만 됩니다. 액체류는 100ml 이하 용기에 담아 1L 투명 지퍼백에 넣어 주세요.</p>
    </DocShell>
  );
}
