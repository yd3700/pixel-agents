/**
 * orca-pixel-bridge 가 보내는 이벤트 타입.
 *
 * 이 파일은 브리지 저장소의 `src/types.ts` 와 **짝을 이루는 계약**이다.
 * 두 저장소가 분리돼 있으므로 형태를 바꾸면 양쪽에서 `v` 를 올린다.
 *
 * 브리지: https://github.com/yd3700/orca-pixel-bridge
 */

/** 브리지가 보내는 스키마 버전. 모르는 버전의 이벤트는 무시한다. */
export const BRIDGE_SCHEMA_VERSION = 1;

export type OrcaEventType =
  | 'agentStarted'
  | 'toolChanged'
  | 'toolCleared'
  | 'stateDone'
  | 'stateWaiting'
  | 'gateOpened'
  | 'agentStopped';

export interface OrcaBridgeEvent {
  v: number;
  type: OrcaEventType;

  /** `orca:{paneKey}`. Orca 가 발급하는 안정적 식별자. */
  agentId: string;
  /** 'codex' | 'gemini' | 'cursor' ... — 'claude' 는 브리지가 보내지 않는다
   *  (native Claude provider 가 이미 훅으로 같은 세션을 처리하므로 중복 방지). */
  agentKind: string;
  displayName?: string;

  worktree: string;
  branch?: string;

  toolId?: string;
  toolName?: string;

  taskId?: string;
  taskTitle?: string;

  gateId?: string;
  gateQuestion?: string;
  gateOptions?: string[];

  at?: string;
}

/** 브리지 페이로드인지 확인한다. 다른 provider 의 이벤트가 잘못 들어오면 걸러진다. */
export function isOrcaBridgeEvent(raw: unknown): raw is OrcaBridgeEvent {
  if (typeof raw !== 'object' || raw === null) return false;
  const e = raw as Record<string, unknown>;
  return (
    typeof e['type'] === 'string' &&
    typeof e['agentId'] === 'string' &&
    e['agentId'] !== '' &&
    typeof e['agentKind'] === 'string' &&
    typeof e['worktree'] === 'string'
  );
}
