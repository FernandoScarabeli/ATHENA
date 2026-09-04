import { useEffect, useMemo } from 'react';
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type Edge,
  type NodeMouseHandler,
} from '@xyflow/react';
import { requirements } from '../data/requirements';
import { relationCount, relations, type Relation } from '../data/relations';
import { RequirementNode, type RequirementFlowNode } from './RequirementNode';

const nodeTypes = { requirement: RequirementNode };
const impactedIds = new Set(['emissao-gta', 'exploracao', 'vacinacao']);

const positions: Record<string, { x: number; y: number }> = {
  'emissao-gta': { x: 610, y: 365 },
  especie: { x: 1030, y: 95 },
  produtor: { x: 190, y: 180 },
  estabelecimento: { x: 100, y: 520 },
  exploracao: { x: 385, y: 650 },
  nucleo: { x: 70, y: 790 },
  vacinacao: { x: 950, y: 605 },
  finalidade: { x: 980, y: 335 },
  evento: { x: 1200, y: 420 },
  abatedouro: { x: 1170, y: 740 },
  doenca: { x: 880, y: 820 },
  recebimento: { x: 605, y: 80 },
  cancelamento: { x: 360, y: 55 },
  taxa: { x: 665, y: 710 },
  pessoa: { x: 45, y: 320 },
};

type Props = {
  query: string;
  focusId: string | null;
  selectedRelationId: string | null;
  impactMode: boolean;
  impactStates: Record<string, 'impacted' | 'confirmed' | 'dismissed'>;
  onSelectRequirement: (id: string) => void;
  onSelectRelation: (relation: Relation) => void;
};

function GraphFocus({ focusId, query }: Pick<Props, 'focusId' | 'query'>) {
  const { setCenter, fitView } = useReactFlow();

  useEffect(() => {
    const normalized = query.trim().toLocaleLowerCase('pt-BR');
    const matches = requirements.filter((item) => item.title.toLocaleLowerCase('pt-BR').includes(normalized));
    const targetId = focusId || (normalized && matches.length === 1 ? matches[0].id : null);
    if (targetId && positions[targetId]) {
      const point = positions[targetId];
      setCenter(point.x + 95, point.y + 44, { zoom: 1.05, duration: 650 });
    } else if (!normalized && !focusId) {
      fitView({ padding: 0.16, duration: 500 });
    }
  }, [fitView, focusId, query, setCenter]);

  return null;
}

export function RequirementGraph({ query, focusId, selectedRelationId, impactMode, impactStates, onSelectRequirement, onSelectRelation }: Props) {
  const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');
  const matchingIds = useMemo(() => new Set(requirements.filter((item) => item.title.toLocaleLowerCase('pt-BR').includes(normalizedQuery)).map((item) => item.id)), [normalizedQuery]);
  const nodes = useMemo<RequirementFlowNode[]>(() => requirements.map((requirement) => {
    let state: RequirementFlowNode['data']['state'] = 'normal';
    if (impactMode && requirement.id === 'especie') state = 'changed';
    if (impactMode && impactedIds.has(requirement.id)) state = impactStates[requirement.id] || 'impacted';
    const relatedToImpact = requirement.id === 'especie' || impactedIds.has(requirement.id);
    const queryMiss = Boolean(normalizedQuery) && !matchingIds.has(requirement.id);

    return {
      id: requirement.id,
      type: 'requirement',
      position: positions[requirement.id],
      data: {
        title: requirement.title,
        relationCount: relationCount(requirement.id),
        state,
        matched: Boolean(normalizedQuery) && matchingIds.has(requirement.id),
        dimmed: (impactMode && !relatedToImpact) || queryMiss,
      },
    };
  }), [impactMode, impactStates, matchingIds, normalizedQuery]);

  const edges = useMemo<Edge[]>(() => relations.map((item) => {
    const isSelected = item.id === selectedRelationId;
    const impactRelevant = ['especie', 'emissao-gta', 'exploracao', 'vacinacao'].includes(item.source) && ['especie', 'emissao-gta', 'exploracao', 'vacinacao'].includes(item.target);
    const queryRelevant = !normalizedQuery || matchingIds.has(item.source) || matchingIds.has(item.target);
    const opacity = impactMode && !impactRelevant ? 0.08 : queryRelevant ? (isSelected ? 1 : 0.46) : 0.08;

    return {
      id: item.id,
      source: item.source,
      target: item.target,
      type: 'smoothstep',
      interactionWidth: 18,
      label: isSelected ? `${item.type} · ${item.confidence}%` : undefined,
      labelStyle: { fontSize: 10, fontWeight: 650, fill: '#4b5563' },
      labelBgStyle: { fill: '#ffffff', fillOpacity: 0.96 },
      labelBgPadding: [7, 4],
      labelBgBorderRadius: 5,
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: isSelected ? '#525f70' : '#b8bec6' },
      style: { stroke: isSelected ? '#525f70' : '#b8bec6', strokeWidth: isSelected ? 1.8 : 1.05, opacity },
    };
  }), [impactMode, matchingIds, normalizedQuery, selectedRelationId]);

  const handleNodeClick: NodeMouseHandler<RequirementFlowNode> = (_, node) => onSelectRequirement(node.id);

  return (
    <div className="graph-wrap">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        onEdgeClick={(_, edge) => {
          const relation = relations.find((item) => item.id === edge.id);
          if (relation) onSelectRelation(relation);
        }}
        fitView
        fitViewOptions={{ padding: 0.16 }}
        minZoom={0.4}
        maxZoom={1.6}
        nodesDraggable
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <GraphFocus focusId={focusId} query={query} />
        <Background color="#d8dce1" gap={20} size={1} />
        <Controls position="bottom-left" showInteractive={false} />
        <MiniMap position="bottom-right" pannable zoomable nodeColor={(node) => node.id === 'emissao-gta' ? '#7b8490' : '#c8cdd3'} maskColor="rgba(247,248,250,.72)" />
      </ReactFlow>
    </div>
  );
}
