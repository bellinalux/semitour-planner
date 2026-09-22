/**
 * 앱 버전 배지 값 ("YYYY.MM.DD-N").
 * 직접 고치지 않는다 — git pre-commit 훅(scripts/bump-version.mjs)이 커밋 1회당 정확히 1번 갱신한다.
 *   - 같은 날이면 N을 1 증가
 *   - 날짜가 바뀌면 오늘 날짜 + N=1
 */
export const APP_VERSION = "2026.09.22-14";
