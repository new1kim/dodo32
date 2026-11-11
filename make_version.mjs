// version.json 생성기 (Node.js)
//
// 사용법 (d:\dodo32 에서):
//   node make_version.mjs
//
// 하는 일:
//   앱이 쓰는 화면 파일들의 SHA-256 해시를 version.json 으로 만든다.
//   앱은 이 파일 하나만 먼저 받아 보고, 해시가 달라진 파일만 내려받는다.
//
// ★ 해시 기준 = "GitHub에 저장된 그대로"
//   이 저장소는 core.autocrlf=true 라서 로컬 파일은 CRLF, GitHub는 LF로 저장된다.
//   로컬 파일을 그대로 해시하면 앱이 받는 파일과 달라져 매번 다시 받게 된다.
//   → `git show HEAD:<파일>` 로 실제 저장본 바이트를 읽어 해시한다.
//   (아직 커밋 안 된 파일은 로컬 내용을 LF로 정규화해 해시)
//
// 주의:
//   - 파일을 수정한 뒤 이 스크립트를 실행하고 GitHub에 푸시해야 앱이 갱신을 감지한다.
//   - op_gongsi_data/ 는 용량이 커서(약 1,900개) 버전 목록에 넣지 않는다(APK 번들 전용).

import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
process.chdir(root);

// 앱이 내려받는 파일 목록 (AssetSyncManager.FILES 와 반드시 같아야 한다)
const FILES = [
  'index.html',
  'gate-auth.js',
  'Consult_Main.html',
  'Consult_calculator_logic.js',
  'Consult_calculator_ui.js',
  'Consult_style.css',
  'DSR_Main.html',
  'DSR_calculator_logic.js',
  'DSR_calculator_ui.js',
  'DSR_style.css',
  'KB시세조회.html',
  '공시가조회.html',
  'OP시세조회.html',
  'DTI.html',
  '계산기.html',
  '날짜계산기.html',
  'MCG.html',
  'IDCard.html',
  '문서스캔.html',
  '소액임차보증금.png',
  '장래예상소득증가율.png',
  '신용점수기준.png',
];

const TEXT_EXT = new Set(['.html', '.js', '.css', '.json', '.md', '.txt', '.gs', '.ps1', '.py']);

function gitShowBytes(path) {
  try {
    return execSync(`git show HEAD:${JSON.stringify(path)}`, {
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

function hashOf(path) {
  // 1) git에 저장된 그대로(줄바꿈 변환 없음)
  const blob = gitShowBytes(path);
  if (blob && blob.length > 0) {
    return { sha256: createHash('sha256').update(blob).digest('hex'), size: blob.length, source: 'git' };
  }
  // 2) 아직 커밋 안 된 파일 → 로컬 내용(텍스트는 LF 정규화)
  if (!existsSync(path)) return null;
  const raw = readFileSync(path);
  const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
  let buf = raw;
  if (TEXT_EXT.has(ext)) {
    buf = Buffer.from(raw.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
  }
  return { sha256: createHash('sha256').update(buf).digest('hex'), size: buf.length, source: 'local' };
}

const files = {};
const missing = [];
const localOnly = [];

for (const f of FILES) {
  const info = hashOf(f);
  if (!info) { missing.push(f); continue; }
  if (info.source === 'local') localOnly.push(f);
  files[f] = { sha256: info.sha256, size: info.size };
}

const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const version = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

const manifest = {
  version,
  generatedAt: now.toISOString(),
  files,
};

writeFileSync(join(root, 'version.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

console.log(`[완료] version.json 생성: ${Object.keys(files).length}개 파일`);
console.log(`  version = ${version}`);
if (localOnly.length) {
  console.log(`  [참고] 아직 커밋 안 된 파일(로컬 기준): ${localOnly.join(', ')}`);
}
if (missing.length) {
  console.log(`  [경고] 없는 파일: ${missing.join(', ')}`);
}
