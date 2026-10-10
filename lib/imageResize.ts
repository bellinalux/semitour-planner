/**
 * 사진·로고를 작게 줄여 data URL로 — 브라우저 저장소(일정·회사 정보)에 넣을 수 있게 긴 변을 maxSide로 줄이고 JPEG(로고는 PNG)로 압축한다.
 * 직접 올린 사진만 쓴다 (다른 사이트 사진을 퍼오지 않는다 — 저작권).
 */
export async function resizeImage(file: File, maxSide: number, type: "image/jpeg" | "image/png" = "image/jpeg", quality = 0.78): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("사진 파일만 올릴 수 있습니다.");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("사진을 읽지 못했습니다."));
      el.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("사진을 줄이지 못했습니다.");
    if (type === "image/jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL(type, quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 저장해도 되는 사진 data URL인지 (크기 제한) */
export function isPhotoData(v: unknown, maxLength: number): v is string {
  return typeof v === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(v) && v.length <= maxLength;
}
