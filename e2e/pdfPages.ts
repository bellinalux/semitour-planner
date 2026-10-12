import { inflateSync } from "node:zlib";

/**
 * 크롬이 만든 PDF를 쪽마다 훑어, 글자를 찍는 명령(Tj·TJ)과 그림을 놓는 명령(Do)의 수를 센다.
 * 글자 내용을 읽지는 않는다 — "이 쪽에 무언가 그려졌는가"만 본다 (빈 쪽·제목만 있는 쪽 찾기용).
 */
export type PdfPage = { textOps: number; images: number };

type PdfObject = { dict: string; data?: Buffer };

function readObjects(buf: Buffer): Map<number, PdfObject> {
  const s = buf.toString("latin1");
  const objects = new Map<number, PdfObject>();
  const re = /(\d+) 0 obj\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const end = s.indexOf("endobj", re.lastIndex);
    if (end < 0) break;
    const body = s.slice(re.lastIndex, end);
    const head = /stream\r?\n/.exec(body);
    const obj: PdfObject = { dict: head ? body.slice(0, head.index) : body };
    if (head) {
      const start = re.lastIndex + head.index + head[0].length;
      obj.data = buf.subarray(start, s.lastIndexOf("endstream", end));
    }
    objects.set(Number(m[1]), obj);
    re.lastIndex = end;
  }
  return objects;
}

const refs = (text: string) => [...text.matchAll(/(\d+) 0 R/g)].map((x) => Number(x[1]));

export function pdfPages(buf: Buffer): PdfPage[] {
  const objects = readObjects(buf);
  const catalog = [...objects.values()].find((o) => /\/Type\s*\/Catalog\b/.test(o.dict));
  const rootId = Number(/\/Pages (\d+) 0 R/.exec(catalog?.dict ?? "")?.[1]);
  // 쪽 순서는 /Pages 나무의 /Kids 순서를 따른다
  const pageIds = (id: number): number[] => {
    const o = objects.get(id);
    if (!o) return [];
    if (/\/Type\s*\/Pages\b/.test(o.dict)) return refs(/\/Kids\s*\[([^\]]*)\]/.exec(o.dict)?.[1] ?? "").flatMap(pageIds);
    return [id];
  };
  return pageIds(rootId).map((id) => {
    const contents = /\/Contents\s*(\[[^\]]*\]|\d+ 0 R)/.exec(objects.get(id)?.dict ?? "")?.[1] ?? "";
    const page: PdfPage = { textOps: 0, images: 0 };
    for (const ref of refs(contents)) {
      const c = objects.get(ref);
      if (!c?.data) continue;
      const ops = (/FlateDecode/.test(c.dict) ? inflateSync(c.data) : c.data).toString("latin1");
      page.textOps += ops.match(/T[jJ]\b/g)?.length ?? 0;
      page.images += ops.match(/\bDo\b/g)?.length ?? 0;
    }
    return page;
  });
}
