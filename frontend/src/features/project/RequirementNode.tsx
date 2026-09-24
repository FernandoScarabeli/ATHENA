import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Icon } from '../../components/Icon';
import type { RequirementStatus } from '../../lib/types';
import type { RequirementFlowNode } from './requirementGraphLayout';

const statusLabels: Record<RequirementStatus, string> = { DRAFT: 'Rascunho', ACTIVE: 'Ativo', ARCHIVED: 'Arquivado' };

function RequirementNodeView({ data }: NodeProps<RequirementFlowNode>) {
  return (
    <div className={`requirement-node type-${data.type.toLowerCase()} status-${data.status.toLowerCase()} ${data.relationState === 'selected' ? 'node-impact-selected' : ''} ${data.relationState === 'related' ? 'node-impact-related' : ''} ${data.matched ? 'node-matched' : ''} ${data.dimmed ? 'node-dimmed' : ''}`} title="Arraste para reordenar nesta pasta; use Alt + setas quando o cartão estiver focado" aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown">
      <Handle type="target" position={Position.Left} className="flow-handle"/>
      <div className="node-kicker"><span>{data.code}</span><span className="node-state">{statusLabels[data.status]}</span></div>
      <div className="node-title">{data.title}</div>
      <div className="node-meta"><Icon name="branch" size={12}/>{data.relationCount} {data.relationCount === 1 ? 'relação' : 'relações'}</div>
      <Handle type="source" position={Position.Right} className="flow-handle"/>
    </div>
  );
}

export const RequirementNode = memo(RequirementNodeView);
