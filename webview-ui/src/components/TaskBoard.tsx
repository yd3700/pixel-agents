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

interface TaskBoardProps {
  tasks: BoardTask[];
  gates: BoardGate[];
  onClose: () => void;
}

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

const COLUMN_COLOR: Record<Column, string> = {
  READY: BOARD_STATUS_READY_COLOR,
  WORKING: BOARD_STATUS_WORKING_COLOR,
  BLOCKED: BOARD_STATUS_BLOCKED_COLOR,
  DONE: BOARD_STATUS_DONE_COLOR,
};

function columnOf(status: string): Column {
  return COLUMN_OF[status.toLowerCase()] ?? 'READY';
}

export function TaskBoard({ tasks, gates, onClose }: TaskBoardProps) {
  const pendingGates = gates.filter((g) => g.status === 'pending');
  const grouped = COLUMNS.map((column) => ({
    column,
    items: tasks.filter((t) => columnOf(t.status) === column),
  }));

  return (
    <div className="pixel-panel absolute top-0 right-0 h-full w-320 max-w-[35vw] flex flex-col overflow-hidden z-20">
      <div className="flex items-center justify-between px-14 py-12 border-b border-border">
        <span className="text-sm">Orca Board</span>
        <button type="button" onClick={onClose} className="text-sm px-6" aria-label="Close board">
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-14 py-14 flex flex-col gap-20">
        {pendingGates.length > 0 && <DecisionGatePanel gates={pendingGates} />}

        {tasks.length === 0 && pendingGates.length === 0 ? (
          <p className="text-2xs opacity-60 leading-relaxed">
            진행 중인 작업이 없습니다.
            <br />
            Orca 에서 작업을 만들면 여기에 나타납니다.
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
                    <li
                      key={task.id}
                      className="text-2xs px-10 py-8 border-l-2 leading-snug break-words"
                      style={{ borderColor: COLUMN_COLOR[column] }}
                    >
                      {task.title}
                    </li>
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
