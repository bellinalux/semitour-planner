import { AlertTriangle, RotateCw } from "lucide-react";

interface Props {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorBanner({ title = "오류가 발생했습니다", message, onRetry }: Props) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-red-800">{title}</p>
        <p className="mt-0.5 text-xs text-red-700">{message}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
        >
          <RotateCw className="h-3.5 w-3.5" aria-hidden />
          다시 시도
        </button>
      )}
    </div>
  );
}
