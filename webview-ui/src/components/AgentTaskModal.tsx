/**
 * 캐릭터를 클릭했을 때 뜨는 창 — 이 에이전트에게 일을 준다.
 *
 * 보드의 `+ 작업` 은 만들기만 하고 배정은 따로지만, 여기서는 만들자마자 넘긴다.
 * 사용자가 캐릭터를 골라서 연 창이라 대상이 이미 정해져 있고, 그 상태에서
 * 배정을 한 번 더 누르게 하는 건 같은 결정을 두 번 묻는 것이다.
 *
 * 프롬프트를 터미널에 직접 치는 것과 결과는 비슷하지만 경로가 다르다. 이건
 * 작업으로 남아 보드에서 추적되고, 셸에 텍스트가 들어가지 않는다.
 */
import { useEffect, useState } from 'react';

import { transport } from '../transport/index.js';
import { Button } from './ui/Button.js';
import { Modal } from './ui/Modal.js';

/** 서버·브리지의 상한과 같은 값. */
const MAX_TITLE = 200;
const MAX_SPEC = 4000;

interface AgentTaskModalProps {
  /** 대상 에이전트. null 이면 창이 닫혀 있다. */
  agent: { id: number; label: string } | null;
  onClose: () => void;
}

export function AgentTaskModal({ agent, onClose }: AgentTaskModalProps) {
  const [title, setTitle] = useState('');
  const [spec, setSpec] = useState('');

  // 대상이 바뀌면 이전에 쓰던 내용이 남아 엉뚱한 에이전트에게 갈 수 있다.
  useEffect(() => {
    setTitle('');
    setSpec('');
  }, [agent?.id]);

  if (!agent) return null;

  const ready = title.trim() !== '' && spec.trim() !== '';

  const send = () => {
    if (!ready) return;
    transport.send({
      type: 'createTask',
      title: title.trim(),
      spec: spec.trim(),
      agentId: agent.id,
    });
    onClose();
  };

  return (
    <Modal isOpen onClose={onClose} title={`${agent.label} 에게 작업 주기`} className="w-420">
      <div className="flex flex-col gap-10 px-10 pb-10">
        <input
          className="text-xs px-8 py-8 bg-transparent border border-border"
          placeholder="작업 이름"
          maxLength={MAX_TITLE}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
        <textarea
          className="text-xs px-8 py-8 bg-transparent border border-border resize-none"
          placeholder="무엇을 해야 하는지 적으세요"
          rows={6}
          maxLength={MAX_SPEC}
          value={spec}
          onChange={(e) => setSpec(e.target.value)}
        />

        <div className="flex items-center justify-between">
          <span className="text-2xs opacity-40">
            {spec.length}/{MAX_SPEC}
          </span>
          <div className="flex gap-8">
            <Button onClick={() => transport.send({ type: 'focusAgent', id: agent.id })}>
              터미널 열기
            </Button>
            <Button variant="accent" onClick={send} disabled={!ready}>
              보내기
            </Button>
          </div>
        </div>

        <p className="text-2xs opacity-40 leading-snug">
          작업으로 만들어 바로 배정합니다. 보드에서 진행 상태를 볼 수 있습니다.
        </p>
      </div>
    </Modal>
  );
}
