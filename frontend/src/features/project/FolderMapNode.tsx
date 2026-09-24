import { memo } from 'react';
import { Folder, FolderOpen } from 'lucide-react';
import type { NodeProps } from '@xyflow/react';
import type { FolderFlowNode } from './requirementGraphLayout';

function FolderMapNodeView({ id, data }: NodeProps<FolderFlowNode>) {
  return (
    <div className={`folder-map-node ${data.empty ? 'is-empty' : ''} ${data.collapsed ? 'is-collapsed' : ''}`} role="group" aria-label={`Pasta ${data.name}`}>
      <header className="folder-map-node__header">
        <button className="folder-map-node__toggle nodrag" type="button" aria-label={`${data.collapsed ? 'Expandir' : 'Recolher'} pasta ${data.name}`} aria-expanded={!data.collapsed} onClick={(event) => { event.preventDefault(); event.stopPropagation(); data.onToggle?.(id); }}>
          {data.collapsed ? <Folder size={15} aria-hidden="true"/> : <FolderOpen size={15} aria-hidden="true"/>}
        </button>
        <strong>{data.name}</strong>
        <span>{data.requirementCount} US</span>
      </header>
    </div>
  );
}

export const FolderMapNode = memo(FolderMapNodeView);
