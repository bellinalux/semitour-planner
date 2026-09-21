import { BadgeCheck, Check, ExternalLink, MapPin, TrainFront } from "lucide-react";
import { formatMoney } from "@/lib/currency";
import type { CurrencyCode, HotelCandidate } from "@/types";

interface Props {
  hotel: HotelCandidate;
  currency: CurrencyCode;
  selected: boolean;
  onSelect: () => void;
}

/** 역까지의 거리 문구. 도보 30분이 넘으면 "역에서 멀어요"로 바꿔 보여준다 */
function stationText(hotel: HotelCandidate): string | null {
  if (!hotel.nearestStation) return null;
  if (hotel.walkMinutes > 30) return `${hotel.nearestStation} · 역에서 멀어요 (도보 ${hotel.walkMinutes}분 이상)`;
  return hotel.walkMinutes > 0 ? `${hotel.nearestStation} 도보 ${hotel.walkMinutes}분` : hotel.nearestStation;
}

export function HotelCard({ hotel, currency, selected, onSelect }: Props) {
  const station = stationText(hotel);
  const range =
    hotel.nightlyLow === hotel.nightlyHigh
      ? formatMoney(hotel.nightlyLow, currency)
      : `${formatMoney(hotel.nightlyLow, currency)} ~ ${formatMoney(hotel.nightlyHigh, currency)}`;

  return (
    <li className={`rounded-lg border p-3 ${selected ? "border-indigo-500 bg-indigo-50/50 ring-1 ring-indigo-500" : "border-slate-200 bg-white"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold leading-5 text-slate-900">{hotel.name}</h4>
          <span className="mt-0.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{hotel.grade}</span>
        </div>
        <button
          type="button"
          onClick={onSelect}
          disabled={selected}
          className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold ${
            selected ? "bg-indigo-100 text-indigo-700" : "bg-indigo-600 text-white hover:bg-indigo-700"
          }`}
        >
          {selected && <Check className="h-3.5 w-3.5" aria-hidden />}
          {selected ? "선택됨" : "이 호텔로 설정"}
        </button>
      </div>

      <div className="mt-2 space-y-1 text-[11px] leading-4 text-slate-600">
        <p className="flex items-start gap-1.5">
          <MapPin className="mt-px h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
          <span>{hotel.area}</span>
        </p>
        {station && (
          <p className="flex items-start gap-1.5">
            <TrainFront className="mt-px h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
            <span>{station}</span>
          </p>
        )}
        <p className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold tabular-nums text-slate-900">1박 {range}</span>
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
              hotel.priceBasis === "searched" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
            }`}
            title={hotel.priceBasis === "searched" ? "웹 검색에서 확인한 요금 범위 (날짜·시즌에 따라 달라짐)" : "AI 추정"}
          >
            {hotel.priceBasis === "searched" ? "검색 확인" : "추정"}
          </span>
        </p>
        {hotel.koreanFriendly && (
          <p className="flex items-start gap-1.5 text-sky-700">
            <BadgeCheck className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              <span className="font-semibold">한국인 이용 확인</span> — {hotel.koreanNote}
            </span>
          </p>
        )}
        {hotel.highlights && <p className="text-slate-500">{hotel.highlights}</p>}
      </div>

      <a
        href={hotel.mapUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:underline"
      >
        구글 지도에서 보기
        <ExternalLink className="h-3 w-3" aria-hidden />
      </a>
    </li>
  );
}
