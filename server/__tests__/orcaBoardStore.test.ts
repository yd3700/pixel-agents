/**
 * Command queue validation.
 *
 * This queue is the only path by which the UI can change Orca state. Everything
 * else in this integration is read-only, so if the whitelist here leaks, anything
 * that reaches the WebSocket can decide gates and assign work. The origin check in
 * httpServer.ts keeps browsers out; this keeps a legitimate client honest.
 *
 * So the rejection cases matter more than the happy path.
 */
import { describe, expect, it } from 'vitest';

import { OrcaBoardStore } from '../src/orcaBoardStore.js';

function seeded(): OrcaBoardStore {
  const store = new OrcaBoardStore();
  store.update({
    v: 1,
    tasks: [{ id: 'task_1', title: 'Auth', status: 'blocked' }],
    gates: [
      {
        id: 'gate_1',
        taskId: 'task_1',
        question: 'include email verification?',
        options: ['include', 'exclude'],
        status: 'pending',
      },
      {
        id: 'gate_done',
        question: 'already decided',
        options: ['yes'],
        status: 'resolved',
      },
      {
        id: 'gate_free',
        question: 'free text, no options',
        status: 'pending',
      },
    ],
    at: '2026-07-28T00:00:00Z',
  });
  return store;
}

describe('resolveGate queueing', () => {
  it('accepts an offered option on a pending gate', () => {
    const store = seeded();
    expect(store.enqueueResolveGate('gate_1', 'include')).toBe(true);
    expect(store.drain()).toEqual([
      { kind: 'resolveGate', gateId: 'gate_1', resolution: 'include' },
    ]);
  });

  it('rejects an option that was never offered', () => {
    const store = seeded();
    expect(store.enqueueResolveGate('gate_1', 'rm -rf /')).toBe(false);
    expect(store.drain()).toEqual([]);
  });

  it('rejects a gate that is not on the board', () => {
    const store = seeded();
    expect(store.enqueueResolveGate('gate_nope', 'include')).toBe(false);
    expect(store.drain()).toEqual([]);
  });

  it('rejects a gate that is already decided', () => {
    const store = seeded();
    expect(store.enqueueResolveGate('gate_done', 'yes')).toBe(false);
    expect(store.drain()).toEqual([]);
  });

  it('rejects a gate with no options — free text is out of scope', () => {
    const store = seeded();
    expect(store.enqueueResolveGate('gate_free', 'anything')).toBe(false);
    expect(store.drain()).toEqual([]);
  });

  it('rejects non-string input', () => {
    const store = seeded();
    expect(store.enqueueResolveGate(42, 'include')).toBe(false);
    expect(store.enqueueResolveGate('gate_1', { toString: () => 'include' })).toBe(false);
    expect(store.drain()).toEqual([]);
  });

  it('rejects everything before any board has arrived', () => {
    const store = new OrcaBoardStore();
    expect(store.enqueueResolveGate('gate_1', 'include')).toBe(false);
    expect(store.drain()).toEqual([]);
  });
});

describe('focus queueing', () => {
  it('accepts a bridge session id', () => {
    const store = seeded();
    expect(store.enqueueFocus('orca:tab-1:leaf-1')).toBe(true);
    expect(store.drain()).toEqual([{ kind: 'focus', agentId: 'orca:tab-1:leaf-1' }]);
  });

  it('rejects ids from other providers', () => {
    const store = seeded();
    expect(store.enqueueFocus('claude-session-abc')).toBe(false);
    expect(store.enqueueFocus(7)).toBe(false);
    expect(store.drain()).toEqual([]);
  });
});

describe('drain', () => {
  it('hands each command over exactly once', () => {
    const store = seeded();
    store.enqueueFocus('orca:a:b');
    expect(store.drain()).toHaveLength(1);
    expect(store.drain()).toEqual([]);
  });

  it('caps the queue so a dead bridge cannot grow memory', () => {
    const store = seeded();
    for (let i = 0; i < 100; i += 1) store.enqueueFocus(`orca:a:${i}`);
    const drained = store.drain();
    expect(drained).toHaveLength(32);
    // Oldest dropped: what the user just clicked is what they want most.
    expect(drained.at(-1)).toEqual({ kind: 'focus', agentId: 'orca:a:99' });
  });

  it('clear() empties the queue too, not just the board', () => {
    const store = seeded();
    store.enqueueFocus('orca:a:b');
    store.clear();
    expect(store.drain()).toEqual([]);
  });
});

describe('dispatch queueing', () => {
  it('accepts a dispatchable task on the board', () => {
    const store = seeded();
    store.update({
      v: 1,
      tasks: [{ id: 'task_ready', title: 'Auth', status: 'ready' }],
      gates: [],
      at: '',
    });
    expect(store.enqueueDispatch('task_ready', 'orca:a:b')).toBe(true);
    expect(store.drain()).toEqual([
      { kind: 'dispatch', taskId: 'task_ready', agentId: 'orca:a:b' },
    ]);
  });

  it('rejects a task that is not on the board', () => {
    const store = seeded();
    expect(store.enqueueDispatch('task_nope', 'orca:a:b')).toBe(false);
    expect(store.drain()).toEqual([]);
  });

  it('rejects a blocked task — dispatching it would jump the gate', () => {
    const store = seeded();
    // seeded() has task_1 as blocked.
    expect(store.enqueueDispatch('task_1', 'orca:a:b')).toBe(false);
    expect(store.drain()).toEqual([]);
  });

  it('rejects a target that is not an Orca agent', () => {
    const store = seeded();
    store.update({
      v: 1,
      tasks: [{ id: 'task_ready', title: 'Auth', status: 'ready' }],
      gates: [],
      at: '',
    });
    expect(store.enqueueDispatch('task_ready', 'claude-session-abc')).toBe(false);
    expect(store.enqueueDispatch('task_ready', 7)).toBe(false);
    expect(store.drain()).toEqual([]);
  });
});

describe('createTask queueing', () => {
  it('accepts a title and spec, trimmed', () => {
    const store = seeded();
    expect(store.enqueueCreateTask('  로그인  ', '  이메일 입력  ')).toBe(true);
    expect(store.drain()).toEqual([{ kind: 'createTask', title: '로그인', spec: '이메일 입력' }]);
  });

  it('rejects blank input', () => {
    const store = seeded();
    expect(store.enqueueCreateTask('   ', 'spec')).toBe(false);
    expect(store.enqueueCreateTask('title', '   ')).toBe(false);
    expect(store.drain()).toEqual([]);
  });

  it('rejects oversized text — this becomes agent input once dispatched', () => {
    const store = seeded();
    expect(store.enqueueCreateTask('t', 'a'.repeat(4001))).toBe(false);
    expect(store.enqueueCreateTask('t'.repeat(201), 'spec')).toBe(false);
    expect(store.drain()).toEqual([]);
  });

  it('rejects non-string input', () => {
    const store = seeded();
    expect(store.enqueueCreateTask(42, 'spec')).toBe(false);
    expect(store.enqueueCreateTask('t', null)).toBe(false);
    expect(store.drain()).toEqual([]);
  });

  it('does not dispatch what it creates — creating never runs anything', () => {
    const store = seeded();
    store.enqueueCreateTask('제목', '명세');
    const drained = store.drain();
    expect(drained).toHaveLength(1);
    expect(drained[0]).toMatchObject({ kind: 'createTask' });
  });
});
