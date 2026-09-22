import { FileText, Loader2, Paperclip, X } from "lucide-react";
import { useRef, useState } from "react";
import { Field, inputClass } from "@/components/ui/Field";
import { COURSE_FILE_TYPES, MAX_COURSE_FILE_BYTES, type CourseFile } from "@/lib/courseFile";

interface Props {
  value: string;
  onChange: (value: string) => void;
  file: CourseFile | null;
  onFileChange: (file: CourseFile | null) => void;
}

const MAX_LENGTH = 12000;

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // "data:image/png;base64,AAAA..." 에서 base64 부분만 뗀다
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** 업체 코스 원문을 텍스트로 붙여넣거나, 코스표 사진·PDF 파일을 올린다. */
export function CoursePasteField({ value, onChange, file, onFileChange }: Props) {
  const length = value.length;
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const pickFile = async (picked: File | undefined) => {
    if (!picked) return;
    setError("");
    if (!(COURSE_FILE_TYPES as readonly string[]).includes(picked.type)) {
      setError("사진(PNG·JPG·WEBP) 또는 PDF 파일만 올릴 수 있습니다.");
      return;
    }
    if (picked.size > MAX_COURSE_FILE_BYTES) {
      setError(`파일이 너무 큽니다. (최대 ${Math.floor(MAX_COURSE_FILE_BYTES / 1024 / 1024)}MB)`);
      return;
    }
    setLoading(true);
    try {
      const data = await readAsBase64(picked);
      onFileChange({ name: picked.name, mimeType: picked.type, data });
    } catch {
      setError("파일을 읽지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Field
      htmlFor="courseText"
      label="업체 코스 원문"
      hint="DAY 1, DAY 2처럼 일차가 구분된 코스를 그대로 붙여넣거나, 코스표 사진·PDF 파일을 올리세요. 붙여넣은 뒤 결과 화면에서 AI가 잘못 읽은 항목을 고칠 수 있습니다."
    >
      <textarea
        id="courseText"
        rows={file ? 4 : 10}
        value={value}
        maxLength={MAX_LENGTH}
        placeholder={
          file
            ? "파일 내용에 참고할 설명이 있으면 적어 주세요 (선택)"
            : "예)\nDAY 1\n✈️ 인천 출발\n↓\n방콕 도착\n↓\n🏨 파타야 5성급 리조트 체크인\n\nDAY 2\n🏝️ ① 산호섬\n↓\n🛕 ② 진리의 성전"
        }
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} resize-y font-mono text-xs leading-5`}
      />
      <p className="mt-1 text-right text-[11px] tabular-nums text-slate-400">
        {length.toLocaleString()} / {MAX_LENGTH.toLocaleString()}자
      </p>

      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={COURSE_FILE_TYPES.join(",")}
          className="hidden"
          aria-label="코스표 사진·PDF 선택"
          onChange={(e) => {
            const picked = e.target.files?.[0];
            e.target.value = "";
            void pickFile(picked);
          }}
        />
        {file ? (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-medium text-indigo-700">
            <FileText className="h-3.5 w-3.5" aria-hidden />
            {file.name}
            <button type="button" onClick={() => onFileChange(null)} aria-label="첨부 파일 제거" className="rounded p-0.5 hover:bg-indigo-100">
              <X className="h-3 w-3" aria-hidden />
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Paperclip className="h-3.5 w-3.5" aria-hidden />}
            {loading ? "읽는 중..." : "코스표 사진·PDF 올리기"}
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
    </Field>
  );
}
