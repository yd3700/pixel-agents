/**
 * Orca 오케스트레이션 보드 — 오른쪽 도킹 패널.
 *
 * 사무실이 "지금 누가 일하고 있는가" 를 보여준다면 이 패널은 "무엇이 남았는가" 를
 * 보여준다. 둘을 동시에 봐야 관제 화면이 되므로 모달이 아니라 도킹으로 둔다.
 *
 * 승인 대기가 맨 위에 온다. 사용자가 막고 있는 것이 가장 급한 정보이기 때문이다.
 * 해결 버튼은 없다 — 지금은 읽기 전용 관제 화면이고, Orca 로 되쏘는 것은 V1.0 이다.
 */
import type { BoardGate, BoardTask } from '../../../core/src/messages.js';
import {
  BOARD_STATUS_BLOCKED_COLOR,
  BOARD_STATUS_DONE_COLOR,
  BOARD_STATUS_READY_COLOR,
  BOARD_STATUS_WORKING_COLOR,
} from '../constants.js';

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
    <div className="pixel-panel absolute top-0 right-0 h-full w-80 flex flex-col overflow-hidden z-20">
      <div className="flex items-center justify-between px-8 py-5 border-b border-border">
        <span className="text-sm">Orca Board</span>
        <button type="button" onClick={onClose} className="text-sm px-4" aria-label="Close board">
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6 flex flex-col gap-8">
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
              <h3 className="text-2xs mb-3" style={{ color: COLUMN_COLOR[column] }}>
                {column} · {items.length}
              </h3>
              {items.length === 0 ? (
                <p className="text-2xs opacity-40">—</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {items.map((task) => (
                    <li
                      key={task.id}
                      className="text-2xs px-5 py-3 border-l-2 leading-snug break-words"
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
 * 선택지를 버튼이 아니라 텍스트로 보여준다. 누르면 Orca 에 결정을 되쏘는 것처럼
 * 보이는데 실제로는 아무 일도 일어나지 않기 때문이다. 되쏘기는 V1.0 이다.
 */
function DecisionGatePanel({ gates }: { gates: BoardGate[] }) {
  return (
    <section>
      <h3 className="text-2xs mb-3" style={{ color: BOARD_STATUS_BLOCKED_COLOR }}>
        승인 필요 · {gates.length}
      </h3>
      <ul className="flex flex-col gap-4">
        {gates.map((gate) => (
          <li
            key={gate.id}
            className="text-2xs px-5 py-4 border leading-snug break-words"
            style={{ borderColor: BOARD_STATUS_BLOCKED_COLOR }}
          >
            <p>{gate.question}</p>
            {gate.options && gate.options.length > 0 && (
              <p className="mt-2 opacity-60">{gate.options.join('  /  ')}</p>
            )}
            <p className="mt-2 opacity-40">Orca 에서 결정하세요</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
