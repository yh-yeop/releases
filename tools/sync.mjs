#!/usr/bin/env node
// 저장소 상태를 규칙에 맞춘다 — GitHub Actions(.github/workflows/sync.yml)가 릴리스가 바뀔 때마다 돌리고, 손으로도 돌릴 수 있다.
//   1. 앱마다 <앱>-latest 의 manifest.json · manifest-pre.json 을 실제 최고 버전 릴리스에 맞춘다 (같으면 건드리지 않음)
//   2. Pages 로 낼 폴더(--out)에 index.json · apps/<앱>/manifest*.json · 아이콘을 만든다
//   3. README 의 앱 표를 갱신한다 (--readme)
//   4. 규칙 위반을 경고로 모은다 (--summary 파일에 Markdown 으로)
//
//   node tools/sync.mjs [--write] [--out <폴더>] [--readme] [--summary <파일>]
//   --write 가 없으면 manifest 를 올리지 않고 무엇을 바꿀지만 보여 준다.
//   토큰: GITHUB_TOKEN 또는 GH_TOKEN, 없으면 `gh auth token`.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, appendFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildManifest, check, indexEntry, latestOf, readmeTable } from './lib.mjs'

const REPO = 'yh-yeop/releases'
const BASE = 'https://yh-yeop.github.io/releases'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const opt = name => { const i = args.indexOf(name); return i < 0 ? null : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) }
const write = Boolean(opt('--write'))
const outDir = opt('--out')
const summaryFile = opt('--summary')

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim()
const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }

async function api(path, init = {}) {
  const res = await fetch(path.startsWith('https://') ? path : `https://api.github.com${path}`, { ...init, headers: { ...headers, ...init.headers } })
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status} ${await res.text()}`)
  return res.status === 204 ? null : res.json()
}

async function allReleases() {
  const out = []
  for (let page = 1; ; page++) {
    const list = await api(`/repos/${REPO}/releases?per_page=100&page=${page}`)
    out.push(...list)
    if (list.length < 100) return out
  }
}

// 키 순서와 상관없이 같은 내용인지
const canon = v => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x))

async function readAsset(asset) {
  const res = await fetch(asset.url, { headers: { ...headers, Accept: 'application/octet-stream' } })
  if (!res.ok) return null
  try { return JSON.parse(await res.text()) } catch { return null }
}

async function ensureLatest(app, releases) {
  const tag = `${app.id}-latest`
  const hit = releases.find(r => r.tag_name === tag)
  if (hit) return hit
  if (!write) return null
  log.push(`${tag}: 고정 릴리스 생성`)
  return api(`/repos/${REPO}/releases`, {
    method: 'POST',
    body: JSON.stringify({
      tag_name: tag, name: `${app.name} 최신 버전 정보 (manifest.json)`, prerelease: true,
      body: `${app.name} 의 최신 버전 정보(manifest.json · manifest-pre.json)를 담는 고정 릴리스입니다. 설치 파일은 \`${app.id}-v<버전>\` 릴리스에서 받으세요.`,
    }),
  })
}

// 임시 이름으로 올린 뒤 옛 파일을 지우고 이름을 바꾼다 → 파일이 없는 순간을 줄인다
async function upload(latest, file, text) {
  const tmp = `${file}.new`
  for (const a of latest.assets.filter(a => a.name === tmp)) await api(`/repos/${REPO}/releases/assets/${a.id}`, { method: 'DELETE' })
  const up = await api(`https://uploads.github.com/repos/${REPO}/releases/${latest.id}/assets?name=${encodeURIComponent(tmp)}`, {
    method: 'POST', body: text, headers: { 'Content-Type': 'application/json' },
  })
  for (const a of latest.assets.filter(a => a.name === file)) await api(`/repos/${REPO}/releases/assets/${a.id}`, { method: 'DELETE' })
  await api(`/repos/${REPO}/releases/assets/${up.id}`, { method: 'PATCH', body: JSON.stringify({ name: file }) })
}

const log = []
const registry = JSON.parse(readFileSync(join(ROOT, 'apps.json'), 'utf8'))
const releases = await allReleases()
const manifests = {}

for (const app of registry.apps) {
  const { stable, pre } = latestOf(app, releases)
  const latest = releases.find(r => r.tag_name === `${app.id}-latest`)
  for (const [file, rel] of [['manifest.json', stable], ['manifest-pre.json', pre]]) {
    const old = latest?.assets.find(a => a.name === file)
    if (!rel) {
      // 프리릴리스가 하나도 남지 않았으면 지운 릴리스를 가리키는 manifest-pre.json 도 치운다
      if (old && file === 'manifest-pre.json') {
        log.push(`${app.id}: ${file} 삭제 (프리릴리스 없음)`)
        if (write) await api(`/repos/${REPO}/releases/assets/${old.id}`, { method: 'DELETE' })
      }
      continue
    }
    const want = buildManifest(app, rel)
    ;(manifests[app.id] ??= {})[file] = want
    const have = old ? await readAsset(old) : null
    if (have && canon(have) === canon(want)) continue
    log.push(`${app.id}: ${file} ${have ? `${have.version} → ` : '새로 '}${want.version}`)
    if (!write) continue
    const target = await ensureLatest(app, releases)
    await upload(target, file, JSON.stringify(want, null, 2) + '\n')
  }
}

const index = {
  schema: 1,
  generated_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  repo: REPO,
  apps: registry.apps.map(app => indexEntry(app, releases, BASE)),
}

if (outDir) {
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'index.json'), JSON.stringify(index, null, 2) + '\n')
  for (const [id, files] of Object.entries(manifests)) {
    mkdirSync(join(outDir, 'apps', id), { recursive: true })
    for (const [file, m] of Object.entries(files)) writeFileSync(join(outDir, 'apps', id, file), JSON.stringify(m, null, 2) + '\n')
  }
  if (existsSync(join(ROOT, 'icons'))) cpSync(join(ROOT, 'icons'), join(outDir, 'icons'), { recursive: true })
  writeFileSync(join(outDir, 'index.html'), `<!doctype html><meta charset="utf-8"><title>yeop releases</title>
<meta http-equiv="refresh" content="0; url=https://github.com/${REPO}#readme">
<p><a href="https://github.com/${REPO}#readme">github.com/${REPO}</a> · <a href="index.json">index.json</a></p>\n`)
  writeFileSync(join(outDir, '.nojekyll'), '')
}

if (opt('--readme')) {
  const p = join(ROOT, 'README.md')
  const s = readFileSync(p, 'utf8')
  const marks = /(<!-- apps:start[^>]*-->)[\s\S]*?(<!-- apps:end -->)/
  if (!marks.test(s)) throw new Error('README 에 <!-- apps:start --> ~ <!-- apps:end --> 표시가 없습니다')
  const next = s.replace(marks, (_, start, end) => `${start}\n${readmeTable(index)}\n${end}`)
  if (next !== s) { writeFileSync(p, next); log.push('README 앱 표 갱신') }
}

const warns = check(registry, releases)
console.log(log.length ? log.map(l => (write ? '' : '[미리 보기] ') + l).join('\n') : '바꿀 것 없음')
if (warns.length) console.log(`\n경고 ${warns.length}건\n` + warns.map(w => '  ' + w).join('\n'))
if (summaryFile) {
  appendFileSync(summaryFile, [
    '### 동기화', ...(log.length ? log.map(l => `- ${l}`) : ['- 바꿀 것 없음']),
    '', `### 규칙 검사 (${warns.length}건)`, ...warns.map(w => `- ${w}`), '',
  ].join('\n'))
}
