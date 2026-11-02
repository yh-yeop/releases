# Releases

소스 코드를 공개하지 않는 앱들의 **설치 파일 배포 전용** 저장소입니다. 앱마다 태그 접두사로 릴리스를 구분합니다.

## 다운로드

앱별 최신 버전과 설치 방법은 [소개 사이트](https://yh-yeop.github.io/)에서 바로 받을 수 있습니다. 지난 버전은 아래 "모든 버전"에서 찾으세요.

| 앱 | 소개 · 최신 버전 | 모든 버전 | 설치 파일 |
|---|---|---|---|
| **YTDL** — 유튜브 → 커버·싱크가사 포함 MP3 (Windows) | [소개](https://yh-yeop.github.io/#p/ytdl) | [목록](https://github.com/yh-yeop/releases/releases?q=YTDL&expanded=true) | `YTDL-Setup-<버전>.exe` |
| **MP3 Checker** — MP3 라이브러리 점검 도구 (Windows) | [소개](https://yh-yeop.github.io/#p/mp3) | [목록](https://github.com/yh-yeop/releases/releases?q=MP3Checker&expanded=true) | `MP3Checker-Setup-<버전>.exe` |
| **Tododoo** — 할 일 정리 (Windows · Android) | [소개](https://yh-yeop.github.io/#p/tododoo) | [목록](https://github.com/yh-yeop/releases/releases?q=Tododoo&expanded=true) | `Tododoo-Setup-<버전>.exe`, `Tododoo-<버전>.apk` |
| **Fracture** — 2D 액션 플랫포머 (Windows, 베타) | [소개 페이지](https://yh-yeop.github.io/p/fracture/) | [목록](https://github.com/yh-yeop/releases/releases?q=Fracture&expanded=true) | `Fracture-<버전>-win64.zip` (압축을 풀고 `Fracture.exe` 실행) |

- 설치 파일 옆의 `<파일>.sha256` 으로 받은 파일이 온전한지 확인할 수 있습니다 (`certutil -hashfile <파일> SHA256`).
- YTDL · MP3 Checker · Tododoo 는 시작할 때 새 버전을 확인해 알려 줍니다. Fracture 는 아직 자동 업데이트가 없습니다.
- 이 저장소 오른쪽의 "Latest" 표시는 마지막으로 올린 앱 하나만 가리킵니다. 앱별 최신 버전은 위 소개 링크에서 보세요.

## 배포 규칙 (관리용 메모)

- 태그는 반드시 `<앱>-v<버전>` 형식 (예: `YTDL-v1.2.0`, `Fracture-v0.9.0-beta`). 앱들이 접두사로 자기 릴리스를 구분하므로 접두사는 앱마다 달라야 함
- 릴리스 제목은 `<표시 이름> <버전>` (예: `MP3 Checker 2.3.7`, 베타는 `Fracture 0.9.0 베타`). 앱은 제목을 보지 않는다
- Windows 설치 파일은 이름에 `Setup` 이 든 `.exe` (`<앱>-Setup-<버전>.exe`). 설치 프로그램이 없는 앱은 `<앱>-<버전>-win64.zip`. 무결성 확인용 `<파일>.sha256` 도 함께 첨부
- 드래프트·프리릴리스는 업데이트 안내에서 무시됨 (베타는 프리릴리스로 올리고 `manifest-pre.json` 으로 알림 — 아래)
- 앱마다 고정 프리릴리스 `<앱>-latest` 를 하나 두고, 버전을 게시할 때마다 그 안의 `manifest.json`(또는 `manifest-pre.json`)을 교체한다 (아래 규약)
- 저장소 전체의 "Latest" 는 마지막으로 올린 앱의 릴리스를 가리키므로 아무것도 여기에 의존하지 않는다. 최신 버전은 `manifest.json` 으로 안다
- 새 앱을 추가하면 위 표에 한 줄, 소개 사이트(`yh-yeop.github.io` 의 `js/data.js`)에 항목 하나를 추가

## manifest.json 규약 (schema 1)

앱·소개 사이트가 릴리스 목록을 훑지 않고 앱별 최신 버전을 알기 위한 파일. 고정 주소에서 받는다:

```
https://github.com/yh-yeop/releases/releases/download/<앱>-latest/manifest.json       정식 최신
https://github.com/yh-yeop/releases/releases/download/<앱>-latest/manifest-pre.json   프리릴리스(베타) 최신 — 베타가 있는 앱만
```

```json
{
  "schema": 1,
  "app": "YTDL",
  "version": "1.5.2",
  "tag": "YTDL-v1.5.2",
  "prerelease": false,
  "published_at": "2026-10-20T10:04:25Z",
  "release_url": "https://github.com/yh-yeop/releases/releases/tag/YTDL-v1.5.2",
  "notes": "릴리스 본문 (Markdown)",
  "assets": {
    "windows": { "name": "YTDL-Setup-1.5.2.exe", "url": "https://github.com/…/YTDL-Setup-1.5.2.exe", "size": 78084578, "sha256": "4002aa…" },
    "android": { "name": "…apk", "url": "…", "size": 0, "sha256": "…" }
  }
}
```

| 필드 | 뜻 |
|---|---|
| `schema` | 형식 버전. 필드를 빼거나 뜻을 바꿀 때만 올린다 (추가는 그대로 1) |
| `version` | `tag` 에서 `<앱>-v` 를 뗀 semver. 베타는 `0.3.0-beta.1` 처럼 프리릴리스 꼬리표를 붙인다 |
| `assets` | 플랫폼 키(`windows`: `Setup` 이 든 `.exe`, 없으면 `win64` 압축본 `.zip` / `android`: `.apk`) → 그 버전 릴리스의 설치 파일. 해당 플랫폼이 없으면 키가 없다. 압축본인지는 `name` 의 확장자로 안다 |
| `sha256` | GitHub 가 계산한 자산 digest. 없으면 `null` |

만드는 쪽 (배포 스크립트):

- 버전 릴리스를 **공개까지 마친 뒤** 그 릴리스를 다시 읽어 만든다 → 반쯤 올라간 릴리스를 가리키는 순간이 없다
- 정식 릴리스는 `manifest.json`, 프리릴리스는 `manifest-pre.json` 을 교체한다. 드래프트는 건드리지 않는다
- 기존 파일이 **더 높은 버전**이면 낮추지 않는다 (강제 옵션으로만)
- 구현: YTDL·MP3Checker `release.ps1` (`-ManifestOnly` 로 다시 만들기), Tododoo `scripts/release.mjs`, 배포 스크립트가 없는 앱(Fracture)은 이 저장소의 `tools/manifest.mjs` — 세 곳의 형식이 같아야 한다
- `tools/manifest.mjs`: 버전 릴리스를 손으로 올린 뒤 `node tools/manifest.mjs <태그>` (gh CLI 로그인 필요, `--dry-run` 으로 미리 보기, `--force` 로 낮추기 허용). `<앱>-latest` 가 없으면 만든다

읽는 쪽 (앱 업데이터):

- 정식 채널은 `manifest.json`, 베타 채널은 `manifest.json` 과 `manifest-pre.json` 을 둘 다 읽어 **더 높은 버전**을 쓴다 (베타 중에 정식이 나오면 정식으로)
- 받지 못하거나 형식이 틀리면 지금처럼 릴리스 목록(`<앱>-v` 접두사)으로 넘어간다
- 브라우저·웹뷰에서 직접 `fetch` 하면 CORS 로 막힌다. 데스크톱(Python)·네이티브 요청에서만 이 주소를 쓰고, 웹은 GitHub API 를 쓴다
