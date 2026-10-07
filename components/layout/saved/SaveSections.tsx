"use client";

import { Cloud, Download, HardDrive, Loader2, Save, Upload } from "lucide-react";
import { useRef } from "react";
import { MAX_NAME_LENGTH } from "@/lib/workspace";

/** 저장·불러오기 창의 윗부분 — 저장 위치(이 브라우저/서버) 고르기, 지금 작업 저장·파일로 주고받기 */

export type StoreKind = "local" | "cloud";

export const buttonClass = "inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50";

function StoreButton({
  kind,
  label,
  Icon,
  store,
  onChoose,
  disabled = false,
}: {
  kind: StoreKind;
  label: string;
  Icon: typeof Cloud;
  store: StoreKind;
  onChoose: (kind: StoreKind) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={store === kind}
      disabled={disabled}
      onClick={() => onChoose(kind)}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
        store === kind ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"
      }`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label}
    </button>
  );
}

interface CloudState {
  status: string;
  reason?: string;
  refresh: () => Promise<unknown> | void;
}

export function StoreSelector({ store, preferred, cloud, onChoose }: { store: StoreKind; preferred: StoreKind; cloud: CloudState; onChoose: (kind: StoreKind) => void }) {
  return (
    <section aria-label="저장 위치" className="space-y-1.5">
      <div role="radiogroup" aria-label="저장 위치" className="inline-flex overflow-hidden rounded-md border border-slate-300 bg-white">
        <StoreButton kind="local" label="이 브라우저" Icon={HardDrive} store={store} onChoose={onChoose} />
        <StoreButton kind="cloud" label="서버 (모든 기기)" Icon={Cloud} store={store} onChoose={onChoose} disabled={cloud.status === "unavailable"} />
      </div>
      {cloud.status === "unavailable" && <p className="text-[11px] leading-4 text-slate-500">서버 저장을 쓸 수 없습니다. {cloud.reason}</p>}
      {cloud.status === "error" && preferred === "cloud" && (
        <p className="flex items-center gap-2 text-[11px] leading-4 text-red-600">
          서버 저장소를 읽지 못했습니다. {cloud.reason}
          <button type="button" onClick={() => void cloud.refresh()} className="rounded border border-red-200 px-1.5 py-0.5 font-medium">
            다시 시도
          </button>
        </p>
      )}
      {store === "cloud" && cloud.status === "loading" && (
        <p className="flex items-center gap-1 text-[11px] text-slate-500">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          서버 목록을 불러오는 중...
        </p>
      )}
    </section>
  );
}

interface SaveProps {
  where: string;
  name: string;
  onName: (name: string) => void;
  busy: boolean;
  sameName: boolean;
  hasWork: boolean;
  onSave: () => void;
  onExport: () => void;
  onFile: (file: File | undefined) => void;
}

export function SaveCurrentSection({ where, name, onName, busy, sameName, hasWork, onSave, onExport, onFile }: SaveProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <section aria-label="현재 작업 저장" className="space-y-2">
      <label htmlFor="plan-name" className="block text-xs font-semibold text-slate-700">
        지금 작업 저장 ({where})
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id="plan-name"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          onChange={(e) => onName(e.target.value)}
          placeholder="예: 파타야 1박 2일 · 6명"
          className="min-w-0 flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
        />
        <button
          type="button"
          onClick={onSave}
          disabled={!name.trim() || busy}
          className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Save className="h-3.5 w-3.5" aria-hidden />}
          {sameName ? "덮어쓰기" : "저장"}
        </button>
      </div>
      <p className="text-[11px] leading-4 text-slate-500">
        입력값, 일정, 오후 코스 선택, 선택 옵션, 세일즈 포인트가 함께 저장됩니다.
        {!hasWork && " 아직 생성된 일정이 없어 입력값만 저장됩니다."}
        {sameName && " 같은 이름이 있어 그 저장본을 덮어씁니다."}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onExport} className={buttonClass}>
          <Download className="h-3.5 w-3.5" aria-hidden />
          파일로 내려받기
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} className={buttonClass}>
          <Upload className="h-3.5 w-3.5" aria-hidden />
          파일에서 가져오기
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          aria-label="일정 파일 선택"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = ""; // 같은 파일을 다시 골라도 동작하게 한다
            onFile(file);
          }}
        />
      </div>
    </section>
  );
}
