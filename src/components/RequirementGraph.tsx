import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  useReactFlow,
  useNodesState,
  type Edge,
  type NodeMouseHandler,
} from '@xyflow/react';
import { RotateCcw } from 'lucide-react';
import { requirementById } from '../data/requirements';
import { relationCount, relations, type Relation } from '../data/relations';
import { RequirementNode, type RequirementFlowNode } from './RequirementNode';

const nodeTypes = { requirement: RequirementNode };
const impactIds = new Set(['emissao-gta', 'exploracao', 'vacinacao']);
const center = { x: 650, y: 420 };

type Props = {
  rootId: string;
  query: string;
  focusId: string | null;
  selectedRelationId: string | null;
  impactMode: boolean;
  impactStates: Record<string, 'impacted' | 'confirmed' | 'dismissed'>;
  onSelectRequirement: (id: string) => void;
  onSelectRelation: (relation: Relation) => void;
};

function getExpandedPositions(rootId: string, relationSet: Relation[]) {
  const outgoingIds = [...new Set(relationSet.filter((item) => item.source === rootId).map((item) => item.target))];
  const incomingIds = [...new Set(relationSet.filter((item) => item.target === rootId).map((item) => item.source))].filter((id) => !outgoingIds.includes(id));
  const positions: Record<string, { x: number; y: number }> = { [rootId]: center };

  const placeColumn = (ids: string[], side: 'left' | 'right') => {
    const perColumn = 6;
    ids.forEach((id, index) => {
      const column = Math.floor(index / perColumn);
      const row = index % perColumn;
      const rowsInColumn = Math.min(perColumn, ids.length - column * perColumn);
      const spacingY = 126;
      const startY = center.y + 44 - ((rowsInColumn - 1) * spacingY) / 2;
      const distance = 390 + column * 245;
      positions[id] = {
        x: side === 'left' ? center.x - distance : center.x + distance,
        y: startY + row * spacingY - 44,
      };
    });
  };

  placeColumn(incomingIds, 'left');
  placeColumn(outgoingIds, 'right');
  return positions;
}

function GraphViewport({ expanded, autoFitEnabled, rootId, focusId }: { expanded: boolean; autoFitEnabled: boolean; rootId: string; focusId: string | null }) {
  const { fitView, setCenter } = useReactFlow();

  useEffect(() => {
    if (!expanded || !autoFitEnabled) return;
    const timer = window.setTimeout(() => fitView({ padding: 0.17, duration: 650, maxZoom: 1 }), 760);
    return () => window.clearTimeout(timer);
  }, [autoFitEnabled, expanded, fitView, rootId]);

  useEffect(() => {
    if (!focusId || !expanded) return;
    const timer = window.setTimeout(() => {
      const node = document.querySelector(`[data-id="${focusId}"]`) as HTMLElement | null;
      if (node) {
        const transform = node.style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/);
        if (transform) setCenter(Number(transform[1]) + 95, Number(transform[2]) + 44, { zoom: 1.05, duration: 550 });
      }
    }, 80);
    return () => window.clearTimeout(timer);
  }, [expanded, focusId, setCenter]);

  return null;
}

export function RequirementGraph({ rootId, query, focusId, selectedRelationId, impactMode, impactStates, onSelectRequirement, onSelectRelation }: Props) {
  const { fitView } = useReactFlow();
  const [expanded, setExpanded] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState<RequirementFlowNode>([]);
  const [layoutChanged, setLayoutChanged] = useState(false);
  const [restoringLayout, setRestoringLayout] = useState(false);
  const [autoFitEnabled, setAutoFitEnabled] = useState(true);

  const directRelations = useMemo(() => relations.filter((item) => item.source === rootId || item.target === rootId), [rootId]);
  const relatedIds = useMemo(() => new Set([rootId, ...directRelations.flatMap((item) => [item.source, item.target])]), [directRelations, rootId]);
  const visibleRelations = useMemo(() => relations.filter((item) => relatedIds.has(item.source) && relatedIds.has(item.target)), [relatedIds]);
  const expandedPositions = useMemo(() => getExpandedPositions(rootId, directRelations), [directRelations, rootId]);

  const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');
  const nodeData = useMemo(() => Object.fromEntries([...relatedIds].map((id) => {
    const requirement = requirementById[id];
    let state: RequirementFlowNode['data']['state'] = 'normal';
    if (impactMode && id === 'especie') state = 'changed';
    if (impactMode && impactIds.has(id)) state = impactStates[id] || 'impacted';
    const relatedToImpact = id === 'especie' || impactIds.has(id);
    const matchesQuery = !normalizedQuery || requirement.title.toLocaleLowerCase('pt-BR').includes(normalizedQuery);
    return [id, {
        title: requirement.title,
        relationCount: relationCount(id),
        state,
        isRoot: id === rootId,
        matched: Boolean(normalizedQuery) && matchesQuery,
        dimmed: (impactMode && !relatedToImpact) || !matchesQuery,
      }];
  })), [impactMode, impactStates, normalizedQuery, relatedIds, rootId]) as Record<string, RequirementFlowNode['data']>;

  useEffect(() => {
    setExpanded(false);
    setLayoutChanged(false);
    setRestoringLayout(false);
    setAutoFitEnabled(true);
    setNodes([...relatedIds].map((id) => ({ id, type: 'requirement', position: center, data: nodeData[id], draggable: false })));
    const timer = window.setTimeout(() => {
      setNodes((current) => current.map((node) => ({ ...node, position: expandedPositions[node.id] || center, draggable: true })));
      setExpanded(true);
    }, 90);
    return () => window.clearTimeout(timer);
  }, [expandedPositions, relatedIds, rootId, setNodes]);

  useEffect(() => {
    setNodes((current) => current.map((node) => ({ ...node, data: nodeData[node.id] })));
  }, [nodeData, setNodes]);

  const edges = useMemo<Edge[]>(() => visibleRelations.map((item, index) => {
    const isSelected = item.id === selectedRelationId;
    const impactRelevant = ['especie', 'emissao-gta', 'exploracao', 'vacinacao'].includes(item.source) && ['especie', 'emissao-gta', 'exploracao', 'vacinacao'].includes(item.target);
    const edgeColor = impactMode && impactRelevant ? '#c76a27' : isSelected ? '#525f70' : '#b8bec6';
    const opacity = expanded ? (impactMode && !impactRelevant ? 0.08 : isSelected ? 1 : 0.5) : 0;
    return {
      id: item.id,
      source: item.source,
      target: item.target,
      type: 'smoothstep',
      interactionWidth: 18,
      animated: expanded && index < 18,
      label: isSelected ? `${item.type} · ${item.confidence}%` : undefined,
      labelStyle: { fontSize: 10, fontWeight: 650, fill: '#4b5563' },
      labelBgStyle: { fill: '#ffffff', fillOpacity: 0.96 },
      labelBgPadding: [7, 4],
      labelBgBorderRadius: 5,
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: edgeColor },
      style: { stroke: edgeColor, strokeWidth: isSelected || (impactMode && impactRelevant) ? 1.8 : 1.05, opacity, transition: `opacity .35s ease ${Math.min(index * 28, 420)}ms` },
    };
  }), [expanded, impactMode, selectedRelationId, visibleRelations]);

  const handleNodeClick: NodeMouseHandler<RequirementFlowNode> = (_, node) => onSelectRequirement(node.id);

  const restoreLayout = useCallback(() => {
    setRestoringLayout(true);
    setLayoutChanged(false);
    setNodes((current) => current.map((node) => ({ ...node, position: expandedPositions[node.id] || center, dragging: false })));
    window.setTimeout(() => fitView({ padding: 0.17, duration: 650, maxZoom: 1 }), 60);
    window.setTimeout(() => {
      setRestoringLayout(false);
    }, 850);
  }, [expandedPositions, fitView, setNodes]);

  return (
    <div className={`graph-wrap dependency-graph ${expanded ? 'is-expanded' : 'is-collapsed'}`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStart={() => setAutoFitEnabled(false)}
        onNodeDragStop={() => { if (!restoringLayout) setLayoutChanged(true); }}
        onNodeClick={handleNodeClick}
        onEdgeClick={(_, edge) => {
          const relation = relations.find((item) => item.id === edge.id);
          if (relation) onSelectRelation(relation);
        }}
        defaultViewport={{ x: 0, y: 0, zoom: 0.82 }}
        minZoom={0.35}
        maxZoom={1.6}
        nodesDraggable
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <GraphViewport expanded={expanded} autoFitEnabled={autoFitEnabled} rootId={rootId} focusId={focusId} />
        <Background color="#d8dce1" gap={20} size={1} />
        <Controls position="bottom-left" showInteractive={false} />
        <MiniMap position="bottom-right" pannable zoomable nodeColor={(node) => node.id === rootId ? '#566271' : '#c8cdd3'} maskColor="rgba(247,248,250,.72)" />
      </ReactFlow>
      {layoutChanged && (
        <button className="graph-reset-button" onClick={restoreLayout} aria-label="Restaurar posições originais" title="Restaurar posições originais">
          <RotateCcw size={14} /> Restaurar layout
        </button>
      )}
    </div>
  );
}
