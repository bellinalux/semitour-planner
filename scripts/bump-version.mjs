#!/usr/bin/env node
/*
 * 앱 버전 배지 자동 갱신 — git pre-commit 훅에서 커밋 1회당 정확히 1번만 실행된다.
 *
 * lib/version.ts 의 APP_VERSION = "YYYY.MM.DD-N" 값을 갱신한다.
 *   - 배지 날짜가 오늘이면 N을 1 증가
 *   - 날짜가 바뀌었으면 오늘 날짜 + N=1
 *
 * 안전장치: 값이 YYYY.MM.DD-N 형식이 아니면 건드리지 않는다.
 * 사용법: node scripts/bump-version.mjs lib/version.ts
 */
import fs from "node:fs";

const VERSION_RE = /(APP_VERSION\s*=\s*")([^"]*)(")/;
const DATE_RE = /^(\d{4}\.\d{2}\.\d{2})-(\d+)$/;

function todayStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

const file = process.argv[2];
if (!file || !fs.existsSync(file)) process.exit(0);

const text = fs.readFileSync(file, "utf8");
const match = text.match(VERSION_RE);
if (!match) process.exit(0);

const current = match[2].trim();
const parts = current.match(DATE_RE);
if (current && !parts) process.exit(0); // 다른 형식은 보존

const today = todayStamp();
const next = parts && parts[1] === today ? `${today}-${parseInt(parts[2], 10) + 1}` : `${today}-1`;
if (next === current) process.exit(0);

fs.writeFileSync(file, text.replace(VERSION_RE, `$1${next}$3`), "utf8");
console.log(`[bump-version] ${current || "(없음)"} -> ${next}`);
