import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { Icon } from '../../components/Icon';
import type { RequirementStatus, RequirementType } from '../../lib/types';

export interface RequirementNodeData extends Record<string, unknown> {
  code: string;
  title: string;
  type: RequirementType;
  status: RequirementStatus;
  relationCount: number;
  matched: boolean;
  dimmed: boolean;
}
export type RequirementFlowNode = Node<RequirementNodeData, 'requirement'>;

const statusLabels: Record<RequirementStatus, string> = { DRAFT: 'Rascunho', ACTIVE: 'Ativo', ARCHIVED: 'Arquivado' };

export function RequirementNode({ data, selected }: NodeProps<RequirementFlowNode>) {
  return (
    <div className={`requirement-node type-${data.type.toLowerCase()} status-${data.status.toLowerCase()} ${selected ? 'node-selected' : ''} ${data.matched ? 'node-matched' : ''} ${data.dimmed ? 'node-dimmed' : ''}`}>
      <Handle type="target" position={Position.Left} className="flow-handle"/>
      <div className="node-kicker"><span>{data.code}</span><span className="node-state">{selected ? 'Selecionada' : statusLabels[data.status]}</span></div>
      <div className="node-title">{data.title}</div>
      <div className="node-meta"><Icon name="branch" size={12}/>{data.relationCount} {data.relationCount === 1 ? 'relação' : 'relações'}</div>
      <Handle type="source" position={Position.Right} className="flow-handle"/>
    </div>
  );
}
