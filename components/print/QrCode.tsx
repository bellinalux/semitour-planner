import qrcode from "qrcode-generator";

/** QR 코드 (SVG) — 웹 일정표 주소를 휴대폰으로 열게 */
export function QrCode({ text, size = 88 }: { text: string; size?: number }) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const cells: string[] = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) cells.push(`M${x + 2},${y + 2}h1v1h-1z`);
  return (
    <svg viewBox={`0 0 ${n + 4} ${n + 4}`} width={size} height={size} role="img" aria-label="웹 일정표 QR 코드" shapeRendering="crispEdges" className="shrink-0">
      <rect width={n + 4} height={n + 4} fill="#ffffff" />
      <path d={cells.join("")} fill="#0f172a" />
    </svg>
  );
}
