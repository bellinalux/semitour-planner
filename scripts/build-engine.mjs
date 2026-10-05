#!/usr/bin/env node
/**
 * 코스 엔진(lib/courseEngine)을 브라우저용 파일 하나로 묶는다 — 상세페이지 스튜디오(tourdesign)가 같은 엔진을 쓰도록.
 *   node scripts/build-engine.mjs ../tourdesign/src/js/35-course-engine.gen.js
 * 결과: window.CourseEngine = { schedule, planDay, scoreCourse, estimateMatrix, sunTimes, hoursText, … }
 * ⚠ 엔진을 고치면 이 명령을 다시 실행해 상세페이지 스튜디오 파일도 갱신한다.
 */
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const out = resolve(process.argv[2] ?? "dist/course-engine.js");
const r = await build({
  entryPoints: [resolve("lib/courseEngine/index.ts")],
  bundle: true, format: "iife", globalName: "CourseEngine", platform: "browser", target: "es2019",
  write: false, legalComments: "none",
});
const version = (readFileSync(resolve("lib/version.ts"), "utf8").match(/APP_VERSION = "([^"]+)"/) ?? [])[1] ?? "";
const head = `/* ⚠ 자동 생성 파일 — 직접 고치지 마세요.\n   원본: semitour-planner/lib/courseEngine (세미투어 ${version})\n   다시 만들기: semitour-planner에서 node scripts/build-engine.mjs <이 파일 경로> */\n`;
writeFileSync(out, head + r.outputFiles[0].text + "window.CourseEngine = CourseEngine;\n");
console.log(`[build-engine] ${out} (${Math.round(r.outputFiles[0].text.length / 1024)} KB)`);
