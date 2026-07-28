/**
 * Orca provider — orca-pixel-bridge 가 보내는 이벤트를 AgentEvent 로 정규화한다.
 *
 * Claude provider 와 다른 점:
 *
 *   1. **훅을 설치하지 않는다.** Orca 가 자기 훅(`~/.orca/agent-hooks/*`)을 이미
 *      관리하고 12개 CLI의 상태를 모은다. 브리지가 그걸 폴링해서 보낸다.
 *      install/uninstall 은 no-op 이고 areHooksInstalled 는 항상 true 다.
 *
 *   2. **트랜스크립트가 없다.** `sessionFilePattern` / `getSessionDirs` /
 *      `parseTranscriptLine` 을 제공하지 않는다. 상태는 전부 훅 이벤트에서 온다.
 *      `adoptExternalSessionFromHook` 의 hooks-only 분기가 이런 provider 를 위한 것이다.
 *
 *   3. **Claude 세션은 다루지 않는다.** 브리지가 `agentType === 'claude'` 를
 *      걸러서 보내지 않는다. native Claude provider 와 캐릭터가 겹치지 않게 하려는 것.
 *
 * 도구 이름은 Orca 가 각 CLI 에서 받은 원문(`Bash`, `Edit`, `PowerShell` 등)이
 * 그대로 온다. Claude 의 도구 어휘와 대체로 겹치므로 읽기/쓰기 분류를 재사용한다.
 */
import type { AgentEvent, HookProvider } from '../../../../../core/src/provider.js';
import type { OrcaBridgeEvent } from './types.js';
import { BRIDGE_SCHEMA_VERSION, isOrcaBridgeEvent } from './types.js';

/** 도구가 없는 이벤트에도 toolId 가 필요할 때 쓰는 센티널. */
const NO_TOOL = 'orca-none';

function toolIdOf(event: OrcaBridgeEvent): string {
  return event.toolId ?? `${event.agentId}-${event.toolName ?? NO_TOOL}`;
}

function normalizeHookEvent(
  raw: Record<string, unknown>,
): { sessionId: string; event: AgentEvent } | null {
  if (!isOrcaBridgeEvent(raw)) return null;
  const event = raw;

  // 모르는 스키마 버전은 조용히 버린다. 브리지가 앞서 나가도 오작동하지 않는다.
  if (typeof event.v === 'number' && event.v !== BRIDGE_SCHEMA_VERSION) return null;

  const sessionId = event.agentId;

  switch (event.type) {
    case 'agentStarted':
      return {
        sessionId,
        // transcriptPath 를 주지 않는 것이 hooks-only 경로를 타는 신호다.
        event: { kind: 'sessionStart', source: 'orca', cwd: event.worktree },
      };

    case 'toolChanged':
      return {
        sessionId,
        event: {
          kind: 'toolStart',
          toolId: toolIdOf(event),
          toolName: event.toolName ?? 'Working',
        },
      };

    case 'toolCleared':
      return { sessionId, event: { kind: 'toolEnd', toolId: toolIdOf(event) } };

    case 'stateDone':
      return { sessionId, event: { kind: 'turnEnd' } };

    case 'stateWaiting':
      return { sessionId, event: { kind: 'turnEnd', awaitingInput: true } };

    case 'gateOpened':
      // AgentEvent.permissionRequest 는 필드를 갖지 않는다. 게이트 질문 텍스트를
      // 실을 자리가 없으므로 여기서는 "승인 대기" 표시만 한다.
      // 질문 본문은 B4 의 Decision Gate 패널이 별도 채널로 받는다.
      return { sessionId, event: { kind: 'permissionRequest' } };

    case 'agentStopped':
      return { sessionId, event: { kind: 'sessionEnd', reason: 'orca' } };

    default:
      return null;
  }
}

/** Orca 는 자기 훅을 스스로 설치한다. Pixel Agents 가 손댈 것이 없다. */
async function installHooks(): Promise<void> {
  /* no-op */
}

async function uninstallHooks(): Promise<void> {
  /* no-op */
}

async function areHooksInstalled(): Promise<boolean> {
  return true;
}

function formatToolStatus(toolName: string, _input?: unknown): string {
  switch (toolName) {
    case 'Bash':
    case 'PowerShell':
    case 'Shell':
      return 'Running a command';
    case 'Read':
      return 'Reading';
    case 'Edit':
    case 'Write':
      return 'Editing';
    case 'Grep':
    case 'Glob':
      return 'Searching';
    case 'WebSearch':
    case 'WebFetch':
      return 'Looking things up';
    default:
      return `Using ${toolName}`;
  }
}

export const orcaProvider: HookProvider = {
  kind: 'hook',
  id: 'orca',
  displayName: 'Orca',
  protocolVersion: 1,

  normalizeHookEvent,

  installHooks,
  uninstallHooks,
  areHooksInstalled,

  formatToolStatus,
  permissionExemptTools: new Set<string>(),
  subagentToolNames: new Set<string>(),
  readingTools: new Set(['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch']),

  // getSessionDirs / sessionFilePattern / parseTranscriptLine 를 두지 않는다.
  // 이 provider 는 트랜스크립트 파일이 없다는 뜻이고, 런타임이 그걸 보고
  // hooks-only 채택 경로를 태운다.
};
