/**
 * Orca provider 테스트.
 *
 * 픽스처는 orca-pixel-bridge 가 실제로 보내는 페이로드 모양이다.
 * 브리지의 `src/types.ts` 와 짝을 이루므로, 한쪽 형태가 바뀌면 이 테스트가 깨져야 한다.
 */
import { describe, expect, it } from 'vitest';

import { orcaProvider } from '../src/providers/hook/orca/orca.js';

/** 브리지가 보내는 봉투 포함 페이로드. */
function bridgeEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const base = {
    v: 1,
    type: 'toolChanged',
    agentId: 'orca:pane-abc:tab-def',
    agentKind: 'codex',
    worktree: 'C:/Users/me/orca/projects/backend',
    branch: 'refs/heads/auth',
    toolId: 'orca-pane-abc-Bash-1784948083640',
    toolName: 'Bash',
    at: '2026-07-28T00:00:00.000Z',
    ...overrides,
  } as Record<string, unknown>;
  // Pixel Agents 훅 라우트가 요구하는 봉투. 브리지의 send.ts 가 붙인다.
  return { ...base, session_id: base['agentId'], hook_event_name: base['type'] };
}

describe('orcaProvider 기본 형태', () => {
  it('hooks-only provider 로 선언된다', () => {
    // sessionFilePattern 이 없다는 것이 "트랜스크립트 파일이 없다" 는 신호이고,
    // 런타임이 그걸 보고 hooks-only 채택 경로를 태운다.
    expect(orcaProvider.sessionFilePattern).toBeUndefined();
    expect(orcaProvider.getSessionDirs).toBeUndefined();
    expect(orcaProvider.parseTranscriptLine).toBeUndefined();
  });

  it('훅을 설치하지 않는다 — Orca 가 자기 훅을 관리한다', async () => {
    await expect(orcaProvider.installHooks('http://127.0.0.1:3100', 't')).resolves.toBeUndefined();
    await expect(orcaProvider.uninstallHooks()).resolves.toBeUndefined();
    await expect(orcaProvider.areHooksInstalled()).resolves.toBe(true);
  });

  it('핸들러가 이해하는 프로토콜 버전을 보고한다', () => {
    expect(orcaProvider.protocolVersion).toBe(1);
    expect(orcaProvider.id).toBe('orca');
  });
});

describe('normalizeHookEvent 매핑', () => {
  it('agentStarted → sessionStart (transcriptPath 없음)', () => {
    const r = orcaProvider.normalizeHookEvent(bridgeEvent({ type: 'agentStarted' }));
    expect(r?.sessionId).toBe('orca:pane-abc:tab-def');
    expect(r?.event).toEqual({
      kind: 'sessionStart',
      source: 'orca',
      cwd: 'C:/Users/me/orca/projects/backend',
    });
    // transcriptPath 가 있으면 파일 기반 채택 경로로 잘못 빠진다.
    expect((r?.event as { transcriptPath?: string }).transcriptPath).toBeUndefined();
  });

  it('toolChanged → toolStart', () => {
    const r = orcaProvider.normalizeHookEvent(bridgeEvent());
    expect(r?.event).toEqual({
      kind: 'toolStart',
      toolId: 'orca-pane-abc-Bash-1784948083640',
      toolName: 'Bash',
    });
  });

  it('toolCleared → toolEnd, toolId 가 짝을 이룬다', () => {
    const start = orcaProvider.normalizeHookEvent(bridgeEvent());
    const end = orcaProvider.normalizeHookEvent(bridgeEvent({ type: 'toolCleared' }));
    expect(end?.event.kind).toBe('toolEnd');
    expect((end?.event as { toolId: string }).toolId).toBe(
      (start?.event as { toolId: string }).toolId,
    );
  });

  it('stateDone → turnEnd, stateWaiting → turnEnd(awaitingInput)', () => {
    expect(orcaProvider.normalizeHookEvent(bridgeEvent({ type: 'stateDone' }))?.event).toEqual({
      kind: 'turnEnd',
    });
    expect(orcaProvider.normalizeHookEvent(bridgeEvent({ type: 'stateWaiting' }))?.event).toEqual({
      kind: 'turnEnd',
      awaitingInput: true,
    });
  });

  it('gateOpened → permissionRequest', () => {
    const r = orcaProvider.normalizeHookEvent(
      bridgeEvent({ type: 'gateOpened', gateQuestion: '이메일 인증을 포함할까요?' }),
    );
    // AgentEvent.permissionRequest 에는 필드가 없다. 질문 본문은 실을 자리가 없고
    // Decision Gate 패널이 별도 채널로 받는다.
    expect(r?.event).toEqual({ kind: 'permissionRequest' });
  });

  it('agentStopped → sessionEnd', () => {
    const r = orcaProvider.normalizeHookEvent(bridgeEvent({ type: 'agentStopped' }));
    expect(r?.event.kind).toBe('sessionEnd');
  });

  it('toolId 가 없으면 agentId 와 toolName 으로 합성한다', () => {
    const e = bridgeEvent();
    delete e['toolId'];
    const r = orcaProvider.normalizeHookEvent(e);
    expect((r?.event as { toolId: string }).toolId).toBe('orca:pane-abc:tab-def-Bash');
  });
});

describe('잘못된 입력은 버린다', () => {
  it('브리지 페이로드가 아니면 null', () => {
    expect(
      orcaProvider.normalizeHookEvent({ hook_event_name: 'Stop', session_id: 'x' }),
    ).toBeNull();
    expect(orcaProvider.normalizeHookEvent({})).toBeNull();
  });

  it('모르는 스키마 버전은 null — 브리지가 앞서 나가도 오작동하지 않는다', () => {
    expect(orcaProvider.normalizeHookEvent(bridgeEvent({ v: 99 }))).toBeNull();
  });

  it('모르는 이벤트 타입은 null', () => {
    expect(orcaProvider.normalizeHookEvent(bridgeEvent({ type: 'somethingNew' }))).toBeNull();
  });

  it('agentId 가 비면 null — sessionId 로 쓸 수 없다', () => {
    expect(orcaProvider.normalizeHookEvent(bridgeEvent({ agentId: '' }))).toBeNull();
  });
});

describe('formatToolStatus', () => {
  it('Orca 가 넘기는 도구 이름을 사람이 읽을 문구로 바꾼다', () => {
    expect(orcaProvider.formatToolStatus('Bash')).toBe('Running a command');
    expect(orcaProvider.formatToolStatus('PowerShell')).toBe('Running a command');
    expect(orcaProvider.formatToolStatus('Read')).toBe('Reading');
    expect(orcaProvider.formatToolStatus('Edit')).toBe('Editing');
  });

  it('모르는 도구도 문구를 만든다', () => {
    expect(orcaProvider.formatToolStatus('SomeCliTool')).toBe('Using SomeCliTool');
  });
});
