import { useEffect, useMemo, useState } from 'react';
import { applyNodeChanges, Background, Controls, MarkerType, MiniMap, ReactFlow, type Edge, type NodeChange, type ReactFlowInstance } from '@xyflow/react';
import type { GraphResponse } from '../../lib/types';
import { Icon } from '../../components/Icon';
import { RequirementNode, type RequirementFlowNode } from './RequirementNode';

const nodeTypes = { requirement: RequirementNode };

function layout(data: GraphResponse, query: string, rootId?: string | null): RequirementFlowNode[] {
  const normalized = query.trim().toLocaleLowerCase('pt-BR');
  const relationCounts = data.edges.reduce<Record<string, number>>((counts, edge) => {
    counts[edge.source] = (counts[edge.source] ?? 0) + 1;
    counts[edge.target] = (counts[edge.target] ?? 0) + 1;
    return counts;
  }, {});
  const connected = rootId ? new Set([rootId, ...data.edges.flatMap((edge) => edge.source === rootId ? [edge.target] : edge.target === rootId ? [edge.source] : [])]) : null;
  const visible = connected ? data.nodes.filter((node) => connected.has(node.id)) : data.nodes;
  const columns = Math.max(1, Math.ceil(Math.sqrt(visible.length)));
  return visible.map((node, index) => {
    const matched = !normalized || `${node.code} ${node.title}`.toLocaleLowerCase('pt-BR').includes(normalized);
    return {
      id: node.id,
      type: 'requirement',
      position: rootId && node.id === rootId ? { x: 500, y: 260 } : { x: (index % columns) * 270, y: Math.floor(index / columns) * 145 },
      data: { ...node, relationCount: relationCounts[node.id] ?? 0, matched: Boolean(normalized) && matched, dimmed: Boolean(normalized) && !matched },
    };
  });
}

export function RequirementGraph({ data, query, rootId, onSelect }: { data: GraphResponse; query: string; rootId?: string | null; onSelect: (id: string) => void }) {
  const computedNodes = useMemo(() => layout(data, query, rootId), [data, query, rootId]);
  const [nodes, setNodes] = useState(computedNodes);
  const [instance, setInstance] = useState<ReactFlowInstance<RequirementFlowNode, Edge> | null>(null);
  const visibleIds = useMemo(() => new Set(computedNodes.map((node) => node.id)), [computedNodes]);
  useEffect(() => { setNodes(computedNodes); }, [computedNodes]);

  const edges = useMemo<Edge[]>(() => data.edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target)).map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: 'smoothstep',
    data: { relationType: edge.type },
    label: edge.type.replaceAll('_', ' '),
    labelStyle: { fontSize: 9, fontWeight: 600, fill: '#79818b' },
    labelBgStyle: { fill: '#fff', fillOpacity: 0.9 },
    labelBgPadding: [5, 3],
    labelBgBorderRadius: 4,
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: '#aeb5bd' },
    style: { stroke: '#b8bec6', strokeWidth: 1.1 },
  })), [data.edges, visibleIds]);

  if (!nodes.length) return <div className="graph-empty"><span className="state-symbol"><Icon name="map" size={20}/></span><strong>Nenhum requisito para exibir</strong><span>Adicione o primeiro requisito.</span></div>;

  return (
    <div className="graph-wrap">
      <ReactFlow<RequirementFlowNode, Edge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onInit={setInstance}
        onNodesChange={(changes: NodeChange<RequirementFlowNode>[]) => setNodes((current) => applyNodeChanges(changes, current))}
        onNodeClick={(_, node) => onSelect(node.id)}
        fitView fitViewOptions={{ padding: 0.2, maxZoom: 1 }} minZoom={0.35} maxZoom={1.6}
        nodesConnectable={false}
      >
        <Background color="#d8dce1" gap={20} size={1}/>
        <Controls position="bottom-left" showInteractive={false}/>
        <MiniMap position="bottom-right" pannable zoomable nodeColor="#c8cdd3" maskColor="rgba(247,248,250,.72)"/>
      </ReactFlow>
      <button className="graph-reset-button" onClick={() => { setNodes(computedNodes); window.setTimeout(() => instance?.fitView({ padding: 0.2, duration: 450, maxZoom: 1 }), 20); }}><Icon name="refresh" size={13}/> Restaurar layout</button>
    </div>
  );
}
