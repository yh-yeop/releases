#!/usr/bin/env node
// 배포 스크립트가 없는 앱(예: Fracture)의 manifest.json / manifest-pre.json 을 만들어 <앱>-latest 에 올린다.
// 형식은 README "manifest.json 규약". YTDL·MP3Checker release.ps1, Tododoo release-core.mjs 와 같은 결과를 내야 한다.
//
//   node tools/manifest.mjs <태그> [--dry-run] [--force]
//   예) node tools/manifest.mjs Fracture-v0.9.0-beta
//
// gh CLI 로그인이 필요하다. 버전 릴리스를 공개까지 마친 뒤 실행한다.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const REPO = 'yh-yeop/releases'
const args = process.argv.slice(2)
const tag = args.find(a => !a.startsWith('--'))
const dryRun = args.includes('--dry-run')
const force = args.includes('--force')
if (!tag || !/^[A-Za-z0-9]+-v\d/.test(tag)) {
  console.error('사용법: node tools/manifest.mjs <앱>-v<버전> [--dry-run] [--force]')
  process.exit(2)
}

const gh = (...a) => execFileSync('gh', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const tryGh = (...a) => { try { return gh(...a) } catch { return null } }

// semver 비교 (프리릴리스 꼬리표 포함): 1.0.0-beta < 1.0.0-beta.2 < 1.0.0
function parse(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(v)
  if (!m) throw new Error(`버전 형식 오류: ${v}`)
  return { core: [+m[1], +m[2], +m[3]], pre: m[4] ? m[4].split('.') : [] }
}
function compare(a, b) {
  const x = parse(a), y = parse(b)
  for (let i = 0; i < 3; i++) if (x.core[i] !== y.core[i]) return x.core[i] - y.core[i]
  if (!x.pre.length || !y.pre.length) return y.pre.length - x.pre.length
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i], q = y.pre[i]
    if (p === undefined) return -1
    if (q === undefined) return 1
    const np = /^\d+$/.test(p), nq = /^\d+$/.test(q)
    if (np && nq) { if (+p !== +q) return +p - +q }
    else if (np !== nq) return np ? -1 : 1
    else if (p !== q) return p < q ? -1 : 1
  }
  return 0
}

// 플랫폼: android = .apk, windows = Setup 이 든 .exe, 설치 프로그램이 없는 앱은 win64 압축본
function platform(name) {
  if (/\.apk$/i.test(name)) return 'android'
  if (/Setup.*\.exe$/i.test(name)) return 'windows'
  if (/win(dows|64)?[^/]*\.zip$/i.test(name)) return 'windows-zip'
  return null
}

const app = tag.slice(0, tag.indexOf('-v'))
const rel = JSON.parse(gh('api', `repos/${REPO}/releases/tags/${tag}`))
if (rel.draft) throw new Error(`${tag} 가 드래프트입니다`)
const version = tag.slice(app.length + 2)
parse(version)

const found = {}
for (const a of rel.assets ?? []) {
  const p = platform(a.name)
  if (!p || found[p]) continue
  const sha = /^sha256:([0-9a-f]{64})$/i.exec(a.digest ?? '')
  found[p] = { name: a.name, url: a.browser_download_url, size: a.size, sha256: sha ? sha[1].toLowerCase() : null }
}
const assets = {}
if (found.windows || found['windows-zip']) assets.windows = found.windows ?? found['windows-zip']
if (found.android) assets.android = found.android
if (!Object.keys(assets).length) throw new Error(`${tag} 에 설치 파일(Setup .exe · win64 .zip · .apk)이 없습니다`)

const manifest = {
  schema: 1, app, version, tag,
  prerelease: Boolean(rel.prerelease),
  published_at: rel.published_at,
  release_url: rel.html_url,
  notes: String(rel.body ?? ''),
  assets,
}
const file = rel.prerelease ? 'manifest-pre.json' : 'manifest.json'
const latestTag = `${app}-latest`
console.log(`${tag} → ${latestTag}/${file}`)
console.log(JSON.stringify({ ...manifest, notes: `(${manifest.notes.length}자)` }, null, 2))

const dir = mkdtempSync(join(tmpdir(), 'manifest-'))
try {
  const latest = tryGh('api', `repos/${REPO}/releases/tags/${latestTag}`)
  if (latest && JSON.parse(latest).assets.some(a => a.name === file)) {
    gh('release', 'download', latestTag, '-R', REPO, '-p', file, '-D', dir)
    const old = JSON.parse(readFileSync(join(dir, file), 'utf8'))
    if (old.version && compare(old.version, version) > 0 && !force) {
      console.error(`기존 ${file} 가 더 높은 버전(${old.version})이라 낮추지 않습니다 (--force 로 강제)`)
      process.exit(1)
    }
    rmSync(join(dir, file))
  }
  if (dryRun) { console.log('[dry-run] 올리지 않음'); process.exit(0) }
  if (!latest) {
    gh('release', 'create', latestTag, '-R', REPO, '--prerelease', '--title', `${app} 최신 버전 정보 (manifest.json)`,
      '--notes', `${app} 의 최신 버전 정보(manifest.json · manifest-pre.json)를 담는 고정 릴리스입니다. 설치 파일은 \`${app}-v<버전>\` 릴리스에서 받으세요.`)
    console.log(`고정 릴리스 ${latestTag} 생성`)
  }
  const path = join(dir, file)
  writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n')
  gh('release', 'upload', latestTag, '-R', REPO, path, '--clobber')
  console.log(`올림: https://github.com/${REPO}/releases/download/${latestTag}/${file}`)
} finally {
  rmSync(dir, { recursive: true, force: true })
}
