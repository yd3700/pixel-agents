# Orca provider

[orca-pixel-bridge](https://github.com/yd3700/orca-pixel-bridge) 가 보내는 이벤트를
`AgentEvent` 로 정규화한다. Orca 가 관리하는 Codex · Gemini · Cursor 등의 세션을
Pixel Agents 사무실에 띄우는 것이 목적이다.

```
Orca (12개 CLI 훅 수집)  →  브리지 (마스킹 + 변화 감지)  →  POST /api/hooks/orca  →  이 provider
```

Claude 세션은 브리지가 보내지 않는다. native Claude provider 가 이미 훅으로 실시간
처리하므로, 브리지까지 보내면 사무실에 같은 사람이 둘 앉는다.

## Claude provider 와 다른 점

**훅을 설치하지 않는다.** Orca 가 `~/.orca/agent-hooks/*` 를 스스로 관리한다.
`installHooks` / `uninstallHooks` 는 no-op 이고 `areHooksInstalled` 는 항상 true 다.

**트랜스크립트가 없다.** `sessionFilePattern` · `getSessionDirs` ·
`parseTranscriptLine` 을 제공하지 않는다. 이것이 런타임에게 "hooks-only provider" 라는
신호이고, `adoptExternalSessionFromHook` 의 hooks-only 분기를 타게 한다.

## 이 provider 를 위해 바꾼 것

upstream 은 단일 provider 구조였다. `AgentRuntime(store, claudeProvider)` 가
하드코딩돼 있었고 `handleEvent(_providerId, ...)` 는 경로 파라미터를 버렸다.

| 파일                  | 변경                                                                               |
| --------------------- | ---------------------------------------------------------------------------------- |
| `hookEventHandler.ts` | `registerProvider()` + `resolveProvider(providerId)`. `_providerId` → `providerId` |
| `agentRuntime.ts`     | `registerProvider()` 위임. hooks-only 세션의 tracked-dir 게이트 우회               |
| `providers/index.ts`  | `orcaProvider` export                                                              |
| `cli.ts`              | 기동 시 `runtime.registerProvider(orcaProvider)`                                   |

싱글톤(`transcriptParser` · `fileWatcher`)은 **건드리지 않았다.** 그것들은 트랜스크립트
파싱 전용이고 이 provider 에는 파싱할 파일이 없다. 덕분에 upstream 병합 부담이 작다.

### tracked-dir 게이트 우회가 필요한 이유

`agentRuntime.onExternalSessionDetected` 는 원래 이렇게 막았다.

```ts
if (!isTrackedProjectDir(projectDir) && !watchAllSessions.current) return;
```

`trackedProjectDirs` 에는 `~/.claude/projects/<slug>` 같은 **트랜스크립트 디렉터리**가
들어간다. hooks-only 세션은 트랜스크립트가 없어 `projectDir` 이 실제 워크스페이스 경로
(`C:/Users/me/orca/projects/backend`)가 되고, 이건 절대 매칭되지 않는다.
그대로 두면 브리지가 보낸 에이전트가 전부 버려진다.

`transcriptPath === undefined` 를 hooks-only 신호로 삼아 게이트를 건너뛴다.
콜백 시그니처를 바꾸지 않고, 의미도 정확하다.

## 봉투 요구사항

`httpServer.ts` 의 훅 라우트가 이렇게 거른다.

```ts
if (event.session_id && event.hook_event_name) {
  dispatch;
}
```

그리고 핸들러 내부가 `event.session_id` 를 21곳에서 읽는다. 21곳을 고치는 대신
**브리지가 봉투를 같이 보낸다.**

```json
{ "v":1, "type":"toolChanged", "agentId":"orca:...", ...,
  "session_id":"orca:...", "hook_event_name":"toolChanged" }
```

두 값 모두 이미 있는 필드에서 파생되므로 새 정보가 아니다.
브리지 `src/send.ts` 의 `envelope()` 가 붙인다.

## 이 환경의 알려진 문제

**rolldown 네이티브 바이너리 누락** — `npm install` 후 `npm run build` 가
`Cannot find module './rolldown-binding.win32-x64-msvc.node'` 로 실패한다.
npm optional dependency 문제다.

```bash
npm install --no-save @rolldown/binding-win32-x64-msvc@1.1.5
git checkout -- package-lock.json   # --no-save 인데도 lockfile 이 바뀐다
```

**Node 20.18.0 에서 vitest 가 안 돈다** — `ERR_REQUIRE_ESM`.
Vite 가 Node 20.19+ / 22.12+ 를 요구한다. 기존 테스트도 같이 실패하므로
이 provider 때문이 아니다. `orcaProvider.test.ts` 는 Node 를 올리면 그대로 돈다.

빌드 때도 같은 경고가 뜬다: `You are using Node.js 20.18.0. Vite requires 20.19+`.

## 테스트

```bash
cd server && npx vitest run __tests__/orcaProvider.test.ts   # Node 20.19+ 필요
```

15개. 이벤트 매핑 7개, 잘못된 입력 거부 4개, provider 형태 3개, 문구 포맷 1개.
