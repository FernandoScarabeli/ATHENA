import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { AlertCircle, Check, GitBranch } from 'lucide-react';

export type RequirementNodeData = {
  title: string;
  relationCount: number;
  state?: 'normal' | 'changed' | 'impacted' | 'confirmed' | 'dismissed';
  dimmed?: boolean;
  matched?: boolean;
};

export type RequirementFlowNode = Node<RequirementNodeData, 'requirement'>;

export function RequirementNode({ data, selected }: NodeProps<RequirementFlowNode>) {
  const stateClass = data.state && data.state !== 'normal' ? `node-${data.state}` : '';

  return (
    <div className={`requirement-node ${stateClass} ${selected ? 'node-selected' : ''} ${data.dimmed ? 'node-dimmed' : ''} ${data.matched ? 'node-matched' : ''}`}>
      <Handle type="target" position={Position.Left} className="flow-handle" />
      <div className="node-kicker">
        <span>US</span>
        {data.state === 'changed' && <span className="node-state"><AlertCircle size={12} /> Alterado</span>}
        {data.state === 'impacted' && <span className="node-state"><AlertCircle size={12} /> Impacto</span>}
        {data.state === 'confirmed' && <span className="node-state"><Check size={12} /> Confirmado</span>}
      </div>
      <div className="node-title">{data.title}</div>
      <div className="node-meta"><GitBranch size={12} /> {data.relationCount} {data.relationCount === 1 ? 'relação' : 'relações'}</div>
      <Handle type="source" position={Position.Right} className="flow-handle" />
    </div>
  );
}
