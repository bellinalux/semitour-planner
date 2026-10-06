// scripts/git-hooks/의 커밋 훅을 이 PC의 .git/hooks에 설치한다 (npm run hooks:install)
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const gitDir = execSync("git rev-parse --git-dir").toString().trim();
const target = join(gitDir, "hooks");
if (!existsSync(target)) mkdirSync(target, { recursive: true });
for (const name of readdirSync("scripts/git-hooks")) {
  copyFileSync(join("scripts/git-hooks", name), join(target, name));
  chmodSync(join(target, name), 0o755);
  console.log(`설치: ${name}`);
}
