/**
 * Orca 오케스트레이션 보드 — 오른쪽 도킹 패널.
 *
 * 사무실이 "지금 누가 일하고 있는가" 를 보여준다면 이 패널은 "무엇이 남았는가" 를
 * 보여준다. 둘을 동시에 봐야 관제 화면이 되므로 모달이 아니라 도킹으로 둔다.
 *
 * 승인 대기가 맨 위에 온다. 사용자가 막고 있는 것이 가장 급한 정보이기 때문이다.
 */
import { useState } from 'react';

import type { BoardGate, BoardTask } from '../../../core/src/messages.js';
import {
  BOARD_STATUS_BLOCKED_COLOR,
  BOARD_STATUS_DONE_COLOR,
  BOARD_STATUS_READY_COLOR,
  BOARD_STATUS_WORKING_COLOR,
} from '../constants.js';
import { transport } from '../transport/index.js';
import { Button } from './ui/Button.js';

/** 배정 대상. Orca 가 관리하는 에이전트만 담긴다. */
export interface BoardAgent {
  id: number;
  label: string;
  kind: string;
}

interface TaskBoardProps {
  tasks: BoardTask[];
  gates: BoardGate[];
  agents: BoardAgent[];
  onClose: () => void;
}

/** 배정할 수 있는 상태. 서버와 브리지가 각각 같은 판단을 다시 한다. */
const DISPATCHABLE = new Set(['ready', 'pending']);

/** Orca 의 status 값을 보드 열로 접는다. 모르는 값은 READY 로 둔다. */
type Column = 'READY' | 'WORKING' | 'BLOCKED' | 'DONE';

const COLUMN_OF: Record<string, Column> = {
  ready: 'READY',
  pending: 'READY',
  dispatched: 'WORKING',
  running: 'WORKING',
  blocked: 'BLOCKED',
  failed: 'BLOCKED',
  completed: 'DONE',
  done: 'DONE',
};

const COLUMNS: Column[] = ['READY', 'WORKING', 'BLOCKED', 'DONE'];

/** 서버·브리지의 상한과 같은 값. 넘기기 전에 입력에서 먼저 막는다. */
const MAX_TITLE = 200;
const MAX_SPEC = 4000;

const COLUMN_COLOR: Record<Column, string> = {
  READY: BOARD_STATUS_READY_COLOR,
  WORKING: BOARD_STATUS_WORKING_COLOR,
  BLOCKED: BOARD_STATUS_BLOCKED_COLOR,
  DONE: BOARD_STATUS_DONE_COLOR,
};

function columnOf(status: string): Column {
  return COLUMN_OF[status.toLowerCase()] ?? 'READY';
}

export function TaskBoard({ tasks, gates, agents, onClose }: TaskBoardProps) {
  const [isCreating, setIsCreating] = useState(false);
  const pendingGates = gates.filter((g) => g.status === 'pending');
  const grouped = COLUMNS.map((column) => ({
    column,
    items: tasks.filter((t) => columnOf(t.status) === column),
  }));

  return (
    <div className="pixel-panel absolute top-0 right-0 h-full w-320 max-w-[35vw] flex flex-col overflow-hidden z-20">
      <div className="flex items-center justify-between px-14 py-12 border-b border-border">
        <span className="text-sm">Orca Board</span>
        <div className="flex items-center gap-8">
          <Button onClick={() => setIsCreating((v) => !v)} title="새 작업 만들기">
            {isCreating ? '취소' : '+ 작업'}
          </Button>
          <button type="button" onClick={onClose} className="text-sm px-6" aria-label="Close board">
            ✕
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-14 py-14 flex flex-col gap-20">
        {isCreating && <NewTaskForm onDone={() => setIsCreating(false)} />}

        {pendingGates.length > 0 && <DecisionGatePanel gates={pendingGates} />}

        {tasks.length === 0 && pendingGates.length === 0 ? (
          <p className="text-2xs opacity-60 leading-relaxed">
            진행 중인 작업이 없습니다.
            <br />위 <span className="opacity-100">+ 작업</span> 으로 만들거나 Orca 에서 만들면
            여기에 나타납니다.
          </p>
        ) : (
          grouped.map(({ column, items }) => (
            <section key={column}>
              <h3 className="text-2xs mb-8" style={{ color: COLUMN_COLOR[column] }}>
                {column} · {items.length}
              </h3>
              {items.length === 0 ? (
                <p className="text-2xs opacity-40">—</p>
              ) : (
                <ul className="flex flex-col gap-8">
                  {items.map((task) => (
                    <TaskCard key={task.id} task={task} column={column} agents={agents} />
                  ))}
                </ul>
              )}
            </section>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * 작업 카드. 배정 가능한 상태면 에이전트 선택기를 연다.
 *
 * 확인 단계를 따로 두지 않는다. "배정" 을 누르고 에이전트를 고르는 두 번의 클릭
 * 자체가 이미 의도를 확인하는 절차다. 게이트와 달리 대상을 골라야 하므로
 * 한 번의 오클릭으로는 아무 일도 일어나지 않는다.
 */
function TaskCard({
  task,
  column,
  agents,
}: {
  task: BoardTask;
  column: Column;
  agents: BoardAgent[];
}) {
  const [picking, setPicking] = useState(false);
  const [sent, setSent] = useState(false);

  const canDispatch = DISPATCHABLE.has(task.status.toLowerCase()) && agents.length > 0;

  const dispatch = (agentId: number) => {
    transport.send({ type: 'dispatchTask', taskId: task.id, agentId });
    setPicking(false);
    setSent(true);
  };

  return (
    <li
      className="text-2xs px-10 py-8 border-l-2 leading-snug break-words"
      style={{ borderColor: COLUMN_COLOR[column] }}
    >
      <p>{task.title}</p>

      {sent ? (
        <p className="mt-6 opacity-60">배정을 보냈습니다…</p>
      ) : picking ? (
        <div className="mt-8 flex flex-wrap gap-6">
          {agents.map((a) => (
            <Button key={a.id} variant="accent" onClick={() => dispatch(a.id)}>
              {a.label}
            </Button>
          ))}
          <Button onClick={() => setPicking(false)}>취소</Button>
        </div>
      ) : (
        canDispatch && (
          <div className="mt-6">
            <Button onClick={() => setPicking(true)}>배정</Button>
          </div>
        )
      )}
    </li>
  );
}

/**
 * 새 작업 입력.
 *
 * 이 화면에서 자유 텍스트가 나가는 유일한 곳이다. 만들기만 하고 배정하지 않는다 —
 * 만든 작업이 저절로 실행되지 않게 두 단계로 나눈 것이 이 기능의 안전 설계다.
 */
function NewTaskForm({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [spec, setSpec] = useState('');

  const ready = title.trim() !== '' && spec.trim() !== '';

  const submit = () => {
    if (!ready) return;
    transport.send({ type: 'createTask', title: title.trim(), spec: spec.trim() });
    onDone();
  };

  return (
    <section
      className="flex flex-col gap-8 border px-10 py-10"
      style={{ borderColor: 'currentColor' }}
    >
      <input
        className="text-2xs px-6 py-6 bg-transparent border border-border"
        placeholder="작업 이름"
        maxLength={MAX_TITLE}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        className="text-2xs px-6 py-6 bg-transparent border border-border resize-none"
        placeholder="무엇을 해야 하는지 적으세요"
        rows={4}
        maxLength={MAX_SPEC}
        value={spec}
        onChange={(e) => setSpec(e.target.value)}
      />
      <div className="flex items-center justify-between">
        <span className="text-2xs opacity-40">
          {spec.length}/{MAX_SPEC}
        </span>
        <Button variant="accent" onClick={submit} disabled={!ready}>
          만들기
        </Button>
      </div>
      <p className="text-2xs opacity-40 leading-snug">만들기만 합니다. 배정은 따로 하세요.</p>
    </section>
  );
}

/**
 * 승인 대기 목록.
 *
 * 선택지를 누르면 바로 실행하지 않고 확인을 한 번 더 받는다. 게이트 결정은
 * 막혀 있던 작업을 풀어 실제 작업 배정으로 이어지고 되돌리기 어려운데,
 * 이 화면은 사무실처럼 생겨서 오클릭이 나기 쉽다.
 *
 * 선택지가 없는 자유 서술형 게이트는 버튼을 주지 않는다 — 임의 문자열은
 * "이미 제시된 것 중에서만" 이라는 제약 밖이라 Orca 에서 결정하게 둔다.
 */
function DecisionGatePanel({ gates }: { gates: BoardGate[] }) {
  return (
    <section>
      <h3 className="text-2xs mb-8" style={{ color: BOARD_STATUS_BLOCKED_COLOR }}>
        승인 필요 · {gates.length}
      </h3>
      <ul className="flex flex-col gap-10">
        {gates.map((gate) => (
          <GateCard key={gate.id} gate={gate} />
        ))}
      </ul>
    </section>
  );
}

function GateCard({ gate }: { gate: BoardGate }) {
  const [pending, setPending] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const confirm = (resolution: string) => {
    transport.send({ type: 'resolveGate', gateId: gate.id, resolution });
    setPending(null);
    // 실제 반영은 브리지 폴링(최대 2초) 뒤 보드가 갱신되며 사라진다.
    // 그때까지 버튼을 다시 누를 수 있으면 같은 결정을 두 번 보내게 된다.
    setSent(true);
  };

  return (
    <li
      className="text-2xs px-10 py-10 border leading-snug break-words"
      style={{ borderColor: BOARD_STATUS_BLOCKED_COLOR }}
    >
      <p>{gate.question}</p>

      {sent ? (
        <p className="mt-8 opacity-60">결정을 보냈습니다…</p>
      ) : !gate.options?.length ? (
        <p className="mt-6 opacity-40">Orca 에서 결정하세요</p>
      ) : pending ? (
        <div className="mt-8 flex flex-col gap-6">
          <p className="opacity-80">&apos;{pending}&apos; 로 결정합니다</p>
          <div className="flex gap-6">
            <Button variant="accent" onClick={() => confirm(pending)}>
              확인
            </Button>
            <Button onClick={() => setPending(null)}>취소</Button>
          </div>
        </div>
      ) : (
        <div className="mt-8 flex flex-wrap gap-6">
          {gate.options.map((option) => (
            <Button key={option} onClick={() => setPending(option)}>
              {option}
            </Button>
          ))}
        </div>
      )}
    </li>
  );
}
