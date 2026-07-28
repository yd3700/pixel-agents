/**
 * Orca 오케스트레이션 보드의 최신 스냅샷을 들고 있는다.
 *
 * 에이전트 상태와 달리 보드는 **전역**이다. 특정 세션에 속하지 않으므로
 * AgentStateStore 가 아니라 별도로 둔다. 브리지가 `POST /api/board/orca` 로
 * 통째로 밀어 넣고, 서버는 그것을 그대로 보관했다가 클라이언트에 흘린다.
 *
 * 서버는 내용을 해석하지 않는다. 마스킹은 브리지에서 이미 끝났다.
 */

export interface BoardTask {
  id: string;
  title: string;
  status: string;
  blockedBy?: string[];
}

export interface BoardGate {
  id: string;
  taskId?: string;
  question: string;
  options?: string[];
  status: string;
}

export interface OrcaBoard {
  tasks: BoardTask[];
  gates: BoardGate[];
  /** 브리지가 스냅샷을 뜬 시각. 화면에 "N초 전" 을 그릴 때 쓴다. */
  at: string;
}

/** 이 서버가 이해하는 브리지 스키마 버전. 다르면 페이로드를 버린다. */
const SUPPORTED_SCHEMA_VERSION = 1;

const EMPTY: OrcaBoard = { tasks: [], gates: [], at: '' };

function toStringArray(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out = raw.filter((v): v is string => typeof v === 'string');
  return out.length > 0 ? out : undefined;
}

/** 신뢰하지 않는 페이로드를 보드 형태로 좁힌다. 모르는 필드는 버린다. */
function parseBoard(raw: unknown): OrcaBoard | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const body = raw as Record<string, unknown>;
  if (typeof body['v'] === 'number' && body['v'] !== SUPPORTED_SCHEMA_VERSION) return null;

  const tasks: BoardTask[] = [];
  for (const item of Array.isArray(body['tasks']) ? body['tasks'] : []) {
    if (typeof item !== 'object' || item === null) continue;
    const t = item as Record<string, unknown>;
    if (typeof t['id'] !== 'string' || t['id'] === '') continue;
    const task: BoardTask = {
      id: t['id'],
      title: typeof t['title'] === 'string' ? t['title'] : t['id'],
      status: typeof t['status'] === 'string' ? t['status'] : 'unknown',
    };
    const blockedBy = toStringArray(t['blockedBy']);
    if (blockedBy) task.blockedBy = blockedBy;
    tasks.push(task);
  }

  const gates: BoardGate[] = [];
  for (const item of Array.isArray(body['gates']) ? body['gates'] : []) {
    if (typeof item !== 'object' || item === null) continue;
    const g = item as Record<string, unknown>;
    if (typeof g['id'] !== 'string' || g['id'] === '') continue;
    const gate: BoardGate = {
      id: g['id'],
      question: typeof g['question'] === 'string' ? g['question'] : '',
      status: typeof g['status'] === 'string' ? g['status'] : 'unknown',
    };
    if (typeof g['taskId'] === 'string') gate.taskId = g['taskId'];
    const options = toStringArray(g['options']);
    if (options) gate.options = options;
    gates.push(gate);
  }

  return { tasks, gates, at: typeof body['at'] === 'string' ? body['at'] : '' };
}

export class OrcaBoardStore {
  private board: OrcaBoard = EMPTY;

  /** 브리지 페이로드를 받는다. 형태가 맞지 않으면 무시하고 false 를 돌려준다. */
  update(raw: unknown): boolean {
    const parsed = parseBoard(raw);
    if (!parsed) return false;
    this.board = parsed;
    return true;
  }

  get(): OrcaBoard {
    return this.board;
  }

  /** 보드가 비어 있으면 UI 가 패널 자체를 숨긴다. */
  isEmpty(): boolean {
    return this.board.tasks.length === 0 && this.board.gates.length === 0;
  }

  clear(): void {
    this.board = EMPTY;
  }
}
