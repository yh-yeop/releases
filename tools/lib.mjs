// releases 저장소 규칙의 순수 함수 모음 (네트워크 없음). sync.mjs 와 테스트가 같이 쓴다.
// 규칙의 정본은 README "배포 규칙" · "manifest.json 규약".

// semver: 1.2.3 또는 1.2.3-beta.1. 아니면 null
export function parseSemver(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(String(v))
  return m ? { core: [+m[1], +m[2], +m[3]], pre: m[4] ? m[4].split('.') : [] } : null
}

// a < b 이면 음수. 1.0.0-beta < 1.0.0-beta.2 < 1.0.0
export function compareSemver(a, b) {
  const x = parseSemver(a), y = parseSemver(b)
  if (!x || !y) throw new Error(`버전 형식 오류: ${!x ? a : b}`)
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

// 설치 파일 종류. android = .apk, windows = Setup 이 든 .exe(설치 프로그램) 또는 win64 압축본, minecraft = 모드팩 .mrpack.
// 부속 파일(.sha256 · .sig)은 null
export function assetKind(name) {
  if (/\.apk$/i.test(name)) return { platform: 'android', kind: 'apk' }
  if (/\.mrpack$/i.test(name)) return { platform: 'minecraft', kind: 'mrpack' }
  if (/Setup.*\.exe$/i.test(name)) return { platform: 'windows', kind: 'installer' }
  if (/win(dows|64)?[^/]*\.zip$/i.test(name)) return { platform: 'windows', kind: 'zip' }
  return null
}

// '<앱>-v<버전>' 태그의 버전. 그 앱의 태그가 아니거나 semver 가 아니면 null
export function versionOf(appId, tag) {
  const prefix = `${appId}-v`
  if (!String(tag).startsWith(prefix)) return null
  const v = tag.slice(prefix.length)
  return parseSemver(v) ? v : null
}

// 화면용 버전: 0.9.0-beta → '0.9.0 베타', 0.9.1-beta.2 → '0.9.1 베타 2'
export const versionText = v => v.replace(/-beta(?:\.(\d+))?$/, (_, n) => ` 베타${n ? ` ${n}` : ''}`)
export const expectedTitle = (app, version) => `${app.name} ${versionText(version)}`

// 플랫폼별 설치 파일 (플랫폼마다 첫 번째 것, windows 는 설치 프로그램을 압축본보다 우선)
export function pickAssets(release, { withKind = false } = {}) {
  const found = {}
  for (const a of release.assets ?? []) {
    const k = assetKind(a.name)
    if (!k) continue
    const slot = `${k.platform}:${k.kind}`
    if (found[slot]) continue
    const sha = /^sha256:([0-9a-f]{64})$/i.exec(a.digest ?? '')
    found[slot] = { name: a.name, url: a.browser_download_url, size: a.size, sha256: sha ? sha[1].toLowerCase() : null, ...(withKind ? { kind: k.kind } : {}) }
  }
  const out = {}
  const win = found['windows:installer'] ?? found['windows:zip']
  if (win) out.windows = win
  if (found['android:apk']) out.android = found['android:apk']
  if (found['minecraft:mrpack']) out.minecraft = found['minecraft:mrpack']
  return out
}

// manifest.json / manifest-pre.json 내용. YTDL·MP3Checker release.ps1, Tododoo release-core.mjs 와 같은 형식
export function buildManifest(app, release) {
  const version = versionOf(app.id, release.tag_name)
  if (!version) throw new Error(`manifest: ${app.id} 릴리스 태그가 아닙니다 (${release.tag_name})`)
  const assets = pickAssets(release)
  if (!Object.keys(assets).length) throw new Error(`manifest: ${release.tag_name} 에 설치 파일이 없습니다`)
  return {
    schema: 1,
    app: app.id,
    version,
    tag: release.tag_name,
    prerelease: Boolean(release.prerelease),
    published_at: release.published_at,
    release_url: release.html_url,
    notes: String(release.body ?? ''),
    assets,
  }
}

export const manifestFile = release => (release.prerelease ? 'manifest-pre.json' : 'manifest.json')

// 앱의 최신 정식·프리릴리스 (게시 순서가 아니라 버전이 가장 높은 것). 설치 파일이 없는 릴리스는 건너뛴다
export function latestOf(app, releases) {
  let stable = null, pre = null
  for (const r of releases) {
    const v = versionOf(app.id, r.tag_name)
    if (!v || r.draft || !Object.keys(pickAssets(r)).length) continue
    const cur = r.prerelease ? pre : stable
    if (!cur || compareSemver(v, versionOf(app.id, cur.tag_name)) > 0) r.prerelease ? (pre = r) : (stable = r)
  }
  return { stable, pre }
}

// 규칙 검사 → 경고 문자열 목록. 고정 릴리스 <앱>-latest 는 검사하지 않는다.
// 설치 파일 짝(.sha256)과 플랫폼은 지금 받게 되는 최신 릴리스만 본다 (규칙 이전의 옛 릴리스는 그대로 둔다)
export function check(registry, releases) {
  const out = []
  const apps = new Map(registry.apps.map(a => [a.id, a]))
  const current = new Set(registry.apps.flatMap(a => Object.values(latestOf(a, releases)).filter(Boolean).map(r => r.tag_name)))
  for (const r of releases) {
    if (r.draft) continue
    const tag = r.tag_name
    const id = tag.replace(/-(v\d.*|latest)$/, '')
    const app = apps.get(id)
    if (!app) { out.push(`${tag}: apps.json 에 없는 앱 (접두사 '${id}')`); continue }
    if (tag === `${id}-latest`) continue
    const v = versionOf(id, tag)
    if (!v) { out.push(`${tag}: 태그가 '<앱>-v<semver>' 형식이 아님`); continue }
    if (/(^|[.-])0\d/.test(v.split('-')[0])) out.push(`${tag}: 버전 숫자에 앞자리 0 (${v}) — 0 을 뗀 버전과 같은 순서로 취급됨`)
    if (r.name !== expectedTitle(app, v)) out.push(`${tag}: 제목 '${r.name}' → '${expectedTitle(app, v)}' 이어야 함`)
    if (Boolean(parseSemver(v).pre.length) !== Boolean(r.prerelease)) out.push(`${tag}: ${r.prerelease ? '프리릴리스인데 버전에 꼬리표(-beta 등)가 없음' : '버전에 꼬리표가 있는데 정식 릴리스임'}`)
    const names = new Set((r.assets ?? []).map(a => a.name))
    const installers = (r.assets ?? []).filter(a => assetKind(a.name))
    if (!installers.length) out.push(`${tag}: 설치 파일(Setup .exe · win64 .zip · .apk · .mrpack)이 없음`)
    if (!current.has(tag)) continue
    for (const a of installers) {
      if (!names.has(`${a.name}.sha256`)) out.push(`${tag}: ${a.name}.sha256 없음`)
      const p = assetKind(a.name).platform
      if (app.platforms && !app.platforms.includes(p)) out.push(`${tag}: apps.json 에 없는 플랫폼 ${p} (${a.name})`)
    }
  }
  return out
}

// 앱 하나의 index.json 항목 (사이트 · 다른 도구가 릴리스 목록을 훑지 않고 쓰는 요약)
export function indexEntry(app, releases, base) {
  const { stable, pre } = latestOf(app, releases)
  const brief = r => r && {
    version: versionOf(app.id, r.tag_name), tag: r.tag_name, name: r.name, prerelease: Boolean(r.prerelease),
    published_at: r.published_at, release_url: r.html_url, assets: pickAssets(r, { withKind: true }),
  }
  const newerPre = pre && (!stable || compareSemver(versionOf(app.id, pre.tag_name), versionOf(app.id, stable.tag_name)) > 0)
  const { id, name, site, category, desc, platforms, beta, page, points, tags } = app
  return {
    id, name, site: site ?? null, category: category ?? 'app', desc: desc ?? '', platforms: platforms ?? [], beta: Boolean(beta),
    page: page ?? (site ? `https://yh-yeop.github.io/#p/${site}` : null),
    icon: app.icon ? (/^https:\/\//.test(app.icon) ? app.icon : `${base}/${app.icon}`) : null,
    ...(points ? { points } : {}), ...(tags ? { tags } : {}),
    list_url: `https://github.com/yh-yeop/releases/releases?q=${encodeURIComponent(id)}&expanded=true`,
    manifest: `${base}/apps/${id}/manifest.json`,
    stable: brief(stable), pre: newerPre ? brief(pre) : null,
  }
}

// README 의 앱 표 (<!-- apps:start --> ~ <!-- apps:end --> 사이를 이것으로 바꾼다)
export function readmeTable(index) {
  const PLAT = { windows: 'Windows', android: 'Android', minecraft: 'Minecraft' }
  const KIND = { installer: '설치 파일', zip: '압축본', apk: 'APK', mrpack: '모드팩' }
  const rows = index.apps.map(a => {
    const rel = a.beta ? (a.pre ?? a.stable) : a.stable
    const plats = a.platforms.map(p => PLAT[p] ?? p).join(' · ')
    const files = rel ? Object.entries(rel.assets).map(([p, x]) => `[${PLAT[p] ?? p} ${KIND[x.kind]}](${x.url})`).join(' · ') : '—'
    const ver = rel ? `[${versionText(rel.version)}](${rel.release_url})` : '—'
    const intro = a.page ? `[소개](${a.page})` : '—'
    return `| **${a.name}** — ${a.desc} (${plats}${a.beta ? ', 베타' : ''}) | ${intro} | ${ver} | ${files} | [목록](${a.list_url}) |`
  })
  return ['| 앱 | 소개 | 최신 | 받기 | 모든 버전 |', '|---|---|---|---|---|', ...rows].join('\n')
}
