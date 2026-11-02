// node --test tools/
import test from 'node:test'
import assert from 'node:assert/strict'
import { compareSemver, assetKind, versionOf, expectedTitle, pickAssets, buildManifest, latestOf, check, indexEntry, readmeTable } from './lib.mjs'

const asset = (name, digest = `sha256:${'a'.repeat(64)}`) => ({ name, browser_download_url: `https://x/${name}`, size: 10, digest })
const rel = (tag, opts = {}) => ({
  tag_name: tag, name: opts.name ?? tag, draft: false, prerelease: false, body: 'notes',
  published_at: '2026-11-02T00:00:00Z', html_url: `https://x/tag/${tag}`, assets: [], ...opts,
})
const YTDL = { id: 'YTDL', name: 'YTDL', platforms: ['windows'], site: 'ytdl', desc: '설명' }
const FR = { id: 'Fracture', name: 'Fracture', platforms: ['windows'], beta: true, page: 'https://p/' }

test('semver 순서', () => {
  const order = ['0.9.0-beta', '0.9.0-beta.2', '0.9.0-beta.10', '0.9.0-rc', '0.9.0', '0.9.1', '0.10.0', '1.0.0']
  for (let i = 1; i < order.length; i++) assert.ok(compareSemver(order[i - 1], order[i]) < 0, `${order[i - 1]} < ${order[i]}`)
  assert.equal(compareSemver('1.2.3', '1.2.3'), 0)
  assert.throws(() => compareSemver('1.2', '1.2.3'))
})

test('설치 파일 종류', () => {
  assert.deepEqual(assetKind('YTDL-Setup-1.5.2.exe'), { platform: 'windows', kind: 'installer' })
  assert.deepEqual(assetKind('Fracture-0.9.0-beta-win64.zip'), { platform: 'windows', kind: 'zip' })
  assert.deepEqual(assetKind('Tododoo-1.0.1.apk'), { platform: 'android', kind: 'apk' })
  for (const n of ['YTDL-Setup-1.5.2.exe.sha256', 'Tododoo-Setup-1.0.1.exe.sig', 'manifest.json', 'source.zip']) assert.equal(assetKind(n), null, n)
})

test('태그 버전과 제목', () => {
  assert.equal(versionOf('YTDL', 'YTDL-v1.5.2'), '1.5.2')
  assert.equal(versionOf('YTDL', 'YTDL-latest'), null)
  assert.equal(versionOf('YTDL', 'MP3Checker-v1.0.0'), null)
  assert.equal(expectedTitle({ name: 'MP3 Checker' }, '2.3.7'), 'MP3 Checker 2.3.7')
  assert.equal(expectedTitle(FR, '0.9.1-beta.2'), 'Fracture 0.9.1 베타 2')
})

test('설치 파일 고르기: 설치 프로그램이 압축본보다 우선, 부속 파일 제외', () => {
  const r = rel('X-v1.0.0', { assets: [asset('X-1.0.0-win64.zip'), asset('X-Setup-1.0.0.exe'), asset('X-Setup-1.0.0.exe.sha256'), asset('X-1.0.0.apk', null)] })
  const a = pickAssets(r, { withKind: true })
  assert.equal(a.windows.name, 'X-Setup-1.0.0.exe')
  assert.equal(a.windows.kind, 'installer')
  assert.equal(a.android.sha256, null)
})

test('manifest 형식 (release.ps1 · Tododoo 와 같은 필드)', () => {
  const m = buildManifest(YTDL, rel('YTDL-v1.5.2', { assets: [asset('YTDL-Setup-1.5.2.exe')] }))
  assert.deepEqual(Object.keys(m), ['schema', 'app', 'version', 'tag', 'prerelease', 'published_at', 'release_url', 'notes', 'assets'])
  assert.deepEqual(Object.keys(m.assets.windows), ['name', 'url', 'size', 'sha256'])
  assert.throws(() => buildManifest(YTDL, rel('YTDL-v1.0.0')))
})

test('최신: 게시 순서가 아니라 가장 높은 버전, 드래프트·설치 파일 없는 릴리스 제외', () => {
  const list = [
    rel('YTDL-v1.4.9', { assets: [asset('YTDL-Setup-1.4.9.exe')] }), // 나중에 올린 옛 버전 수정판
    rel('YTDL-v1.6.0', { draft: true, assets: [asset('YTDL-Setup-1.6.0.exe')] }),
    rel('YTDL-v1.5.3'),
    rel('YTDL-v1.5.2', { assets: [asset('YTDL-Setup-1.5.2.exe')] }),
    rel('YTDL-v1.6.0-beta', { prerelease: true, assets: [asset('YTDL-Setup-1.6.0-beta.exe')] }),
  ]
  const { stable, pre } = latestOf(YTDL, list)
  assert.equal(stable.tag_name, 'YTDL-v1.5.2')
  assert.equal(pre.tag_name, 'YTDL-v1.6.0-beta')
})

test('index 항목: 정식보다 낮은 베타는 pre 로 내지 않는다', () => {
  const list = [rel('YTDL-v2.0.0', { assets: [asset('YTDL-Setup-2.0.0.exe')] }), rel('YTDL-v1.9.0-beta', { prerelease: true, assets: [asset('YTDL-Setup-1.9.0-beta.exe')] })]
  const e = indexEntry(YTDL, list, 'https://b')
  assert.equal(e.stable.version, '2.0.0')
  assert.equal(e.pre, null)
  assert.equal(e.page, 'https://yh-yeop.github.io/#p/ytdl')
  assert.equal(e.manifest, 'https://b/apps/YTDL/manifest.json')
  assert.match(readmeTable({ apps: [e] }), /\[2\.0\.0\]\(https:\/\/x\/tag\/YTDL-v2\.0\.0\) \| \[Windows 설치 파일\]/)
})

test('규칙 검사', () => {
  const reg = { apps: [YTDL, FR] }
  const ok = rel('YTDL-v1.5.2', { name: 'YTDL 1.5.2', assets: [asset('YTDL-Setup-1.5.2.exe'), asset('YTDL-Setup-1.5.2.exe.sha256')] })
  assert.deepEqual(check(reg, [ok, rel('YTDL-latest', { prerelease: true })]), [])
  const bad = [
    rel('Foo-v1.0.0'),
    rel('YTDL-v1.6', { name: 'YTDL 1.6' }),
    rel('YTDL-v1.7.0', { name: 'YTDL-v1.7.0', assets: [asset('YTDL-Setup-1.7.0.exe'), asset('YTDL-1.7.0.apk')] }),
    rel('Fracture-v0.9.01-beta', { name: 'Fracture 0.9.01 베타', assets: [asset('Fracture-0.9.01-beta-win64.zip'), asset('Fracture-0.9.01-beta-win64.zip.sha256')] }),
  ]
  const w = check(reg, bad).join('\n')
  assert.match(w, /Foo-v1\.0\.0: apps\.json 에 없는 앱/)
  assert.match(w, /YTDL-v1\.6: 태그가/)
  assert.match(w, /YTDL-v1\.7\.0: 제목 'YTDL-v1\.7\.0' → 'YTDL 1\.7\.0'/)
  assert.match(w, /YTDL-v1\.7\.0: YTDL-Setup-1\.7\.0\.exe\.sha256 없음/)
  assert.match(w, /YTDL-v1\.7\.0: apps\.json 에 없는 플랫폼 android/)
  assert.match(w, /Fracture-v0\.9\.01-beta: 버전 숫자에 앞자리 0/)
  assert.match(w, /Fracture-v0\.9\.01-beta: 버전에 꼬리표가 있는데 정식 릴리스임/)
})
