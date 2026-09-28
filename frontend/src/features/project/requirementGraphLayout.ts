import { MarkerType, type Edge, type Node } from '@xyflow/react';
import type { GraphResponse, Requirement, RequirementFolder } from '../../lib/types';
import { relationDetails, relationKind, type RelationKind } from './relationSemantics';

export interface FolderNodeData extends Record<string, unknown> {
  name: string;
  description: string;
  requirementCount: number;
  empty: boolean;
  collapsed: boolean;
  highlighted?: boolean;
  defaultPosition: { x: number; y: number };
  onToggle?: (id: string) => void;
}

export interface RequirementNodeData extends Record<string, unknown> {
  code: string;
  title: string;
  type: Requirement['type'];
  status: Requirement['status'];
  relationCount: number;
  matched: boolean;
  dimmed: boolean;
  relationState: 'selected' | 'related' | 'idle';
  focused?: boolean;
  requirementId?: string;
  focusRelation?: { index: number; total: number; description: string };
}

export interface RelationLaneNodeData extends Record<string, unknown> {
  label: string;
}

export type FolderFlowNode = Node<FolderNodeData, 'folder'>;
export type RequirementFlowNode = Node<RequirementNodeData, 'requirement'>;
export type RelationLaneFlowNode = Node<RelationLaneNodeData, 'relationLane'>;
export type MapNode = FolderFlowNode | RequirementFlowNode | RelationLaneFlowNode;

const folderPadding = 16;
const folderHeaderHeight = 48;
const folderGap = 16;
const requirementWidth = 204;
const requirementHeight = 96;
const minimumFolderWidth = folderPadding * 2 + requirementWidth * 2 + folderGap;

export function buildDefaultStoryOrder(requirements: Requirement[], folders: RequirementFolder[]): Record<string, string[]> {
  const folderIds = new Set(folders.map((folder) => folder.id));
  const unfiledFolder = folders.find((folder) => !folder.parentId && folder.name.trim().toLocaleLowerCase('pt-BR') === 'sem pasta');
  const unfiledId = unfiledFolder?.id ?? '__unfiled__';
  return requirements.reduce<Record<string, string[]>>((result, requirement) => {
    const folderId = folderIds.has(requirement.folderId) ? requirement.folderId : unfiledId;
    (result[folderId] ??= []).push(requirement.id);
    return result;
  }, {});
}

export function reorderStoryIds(order: string[], id: string, targetIndex: number): string[] {
  const currentIndex = order.indexOf(id);
  if (currentIndex < 0 || !order.length) return order;
  const result = [...order];
  result.splice(currentIndex, 1);
  result.splice(Math.max(0, Math.min(targetIndex, result.length)), 0, id);
  return result;
}

export function storyOrderIndex(position: { x: number; y: number }, padding = folderPadding): number {
  const column = Math.max(0, Math.min(1, Math.round((position.x - padding) / (requirementWidth + folderGap))));
  const row = Math.max(0, Math.round((position.y - folderHeaderHeight - padding) / (requirementHeight + folderGap)));
  return row * 2 + column;
}

export function shouldUseMapPerformanceMode(storyCount: number, relationCount: number): boolean {
  return storyCount > 500 || relationCount > 1000;
}

interface FolderLayout {
  folder: RequirementFolder;
  requirements: Requirement[];
  children: FolderLayout[];
  padding: number;
  width: number;
  height: number;
}

function buildFolderLayouts(folders: RequirementFolder[], requirements: Requirement[], collapsedFolderIds: ReadonlySet<string>, storyOrderByFolder: Record<string, string[]>, selectedFolderId?: string): FolderLayout[] {
  const foldersById = new Map(folders.map((folder) => [folder.id, folder]));
  const requirementsByFolder = new Map<string, Requirement[]>();
  requirements.forEach((requirement) => {
    const group = requirementsByFolder.get(requirement.folderId);
    if (group) group.push(requirement);
    else requirementsByFolder.set(requirement.folderId, [requirement]);
  });
  const childrenByParent = new Map<string | null, RequirementFolder[]>();
  folders.forEach((folder) => {
    const parentId = folder.parentId && foldersById.has(folder.parentId) ? folder.parentId : null;
    const children = childrenByParent.get(parentId);
    if (children) children.push(folder);
    else childrenByParent.set(parentId, [folder]);
  });

  const knownIds = new Set(folders.map((folder) => folder.id));
  const fallback = requirements.filter((requirement) => !knownIds.has(requirement.folderId));
  const roots = (childrenByParent.get(null) ?? []).map((folder) => createLayout(folder));
  if (fallback.length) {
    const existingFallback = roots.find((layout) => layout.folder.name.trim().toLocaleLowerCase('pt-BR') === 'sem pasta');
    if (existingFallback) existingFallback.requirements.push(...fallback);
    else roots.push(createLayout({ id: '__unfiled__', workspaceId: '', name: 'Sem pasta', description: 'User Stories sem uma pasta associada' }, fallback));
  }
  roots.forEach(sortFolderStories);
  return roots;

  function createLayout(folder: RequirementFolder, extraRequirements: Requirement[] = []): FolderLayout {
    const padding = folder.id === selectedFolderId ? 40 : folderPadding;
    const ownRequirements = requirementsByFolder.get(folder.id) ?? [];
    const children = (childrenByParent.get(folder.id) ?? []).map((child) => createLayout(child));
    const requirementRows = Math.ceil((ownRequirements.length + extraRequirements.length) / 2);
    const ownHeight = requirementRows ? requirementRows * requirementHeight + Math.max(0, requirementRows - 1) * folderGap : 0;
    const collapsed = collapsedFolderIds.has(folder.id);
    const childrenHeight = collapsed ? 0 : children.reduce((height, child) => height + child.height + (height ? folderGap : 0), 0);
    const contentHeight = ownHeight + (ownHeight && childrenHeight ? folderGap : 0) + childrenHeight;
    const childrenWidth = children.length ? Math.max(...children.map((child) => child.width)) : 0;
    return {
      folder,
      requirements: [...ownRequirements, ...extraRequirements],
      children,
      padding,
      width: Math.max(minimumFolderWidth + (padding - folderPadding) * 2, childrenWidth + padding * 2),
      height: collapsed ? folderHeaderHeight : folderHeaderHeight + padding * 2 + Math.max(requirementHeight, contentHeight),
    };
  }

  function sortFolderStories(layout: FolderLayout) {
    const order = storyOrderByFolder[layout.folder.id];
    if (order?.length) {
      const rank = new Map(order.map((id, index) => [id, index]));
      layout.requirements.sort((a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER));
    }
    layout.children.forEach(sortFolderStories);
  }
}

function directNeighborhood(data: GraphResponse, rootId?: string | null): Set<string> | null {
  if (!rootId) return null;
  const result = new Set([rootId]);
  data.edges.forEach((edge) => {
    if (edge.source === rootId) result.add(edge.target);
    if (edge.target === rootId) result.add(edge.source);
  });
  return result;
}

export function buildRequirementMap(data: GraphResponse, folders: RequirementFolder[], requirements: Requirement[], query: string, rootId?: string | null, selectedId?: string | null, collapsedFolderIds: ReadonlySet<string> = new Set(), storyOrderByFolder: Record<string, string[]> = {}, onToggleFolder?: (id: string) => void): MapNode[] {
  const directIds = directNeighborhood(data, rootId);
  const selectedIds = selectedId ? selectedId === rootId && directIds ? directIds : directNeighborhood(data, selectedId) : null;
  const graphIds = new Set(data.nodes.map((node) => node.id));
  const visibleRequirementIds = new Set([...(directIds ?? graphIds)].filter((id) => graphIds.has(id)));
  const graphNodeById = new Map(data.nodes.map((node) => [node.id, node]));
  const normalized = query.trim().toLocaleLowerCase('pt-BR');
  const relationCounts = data.edges.reduce<Record<string, number>>((counts, edge) => {
    counts[edge.source] = (counts[edge.source] ?? 0) + 1;
    counts[edge.target] = (counts[edge.target] ?? 0) + 1;
    return counts;
  }, {});
  const focusedStoryNode = (node: GraphResponse['nodes'][number], position: { x: number; y: number }, zIndex = 2, edgeId?: string, focusRelation?: RequirementNodeData['focusRelation']): RequirementFlowNode => {
    const matched = !normalized || `${node.code} ${node.title}`.toLocaleLowerCase('pt-BR').includes(normalized);
    return {
      id: edgeId ? `focus-relation-${edgeId}` : node.id,
      type: 'requirement',
      position,
      zIndex,
      draggable: false,
      data: { ...node, requirementId: node.id, focused: true, focusRelation, relationCount: relationCounts[node.id] ?? 0, matched: Boolean(normalized) && matched, dimmed: Boolean(normalized) && !matched, relationState: node.id === selectedId ? 'selected' : selectedIds?.has(node.id) ? 'related' : 'idle' },
    };
  };
  if (rootId) {
    const root = graphNodeById.get(rootId);
    if (!root) return [];
    type FocusedRelation = { edge: GraphResponse['edges'][number]; node: GraphResponse['nodes'][number]; kind: RelationKind; index: number; total: number };
    const byNeighbor = new Map<string, FocusedRelation[]>();
    data.edges.forEach((edge) => {
      const neighborId = edge.source === rootId ? edge.target : edge.target === rootId ? edge.source : null;
      const node = neighborId && graphNodeById.get(neighborId);
      if (!node) return;
      const entry: FocusedRelation = { edge, node, kind: relationKind(edge.type, edge.source, edge.target, rootId), index: 0, total: 0 };
      const group = byNeighbor.get(neighborId!);
      if (group) group.push(entry);
      else byNeighbor.set(neighborId!, [entry]);
    });
    const focusedRelations = [...byNeighbor.values()].flatMap((group) => {
      group.sort((a, b) => a.edge.id.localeCompare(b.edge.id));
      return group.map((entry, index) => ({ ...entry, index: index + 1, total: group.length }));
    }).sort((a, b) => a.node.code.localeCompare(b.node.code, 'pt-BR') || a.edge.id.localeCompare(b.edge.id));
    const inLane = (kind: RelationKind) => focusedRelations.filter((entry) => entry.kind === kind);
    const relationNodes: MapNode[] = [];
    const laneStep = requirementHeight + 44;
    const laneCenterY = (index: number, count: number) => (index - (count - 1) / 2) * laneStep;
    const addRelationNode = (entry: FocusedRelation, position: { x: number; y: number }) => {
      const description = relationDetails(entry.kind, root.code, entry.node.code).sentence;
      relationNodes.push(focusedStoryNode(entry.node, position, 2, entry.edge.id, { index: entry.index, total: entry.total, description }));
    };
    let dependencyTop = -requirementHeight / 2;
    let dependencyBottom = requirementHeight / 2;
    const addDependencyLane = (stories: FocusedRelation[], centerX: number, label: string, laneId: string) => {
      stories.forEach((entry, index) => {
        const centerY = laneCenterY(index, stories.length);
        dependencyTop = Math.min(dependencyTop, centerY - requirementHeight / 2);
        dependencyBottom = Math.max(dependencyBottom, centerY + requirementHeight / 2);
        addRelationNode(entry, { x: centerX - requirementWidth / 2, y: centerY - requirementHeight / 2 });
      });
      if (stories.length) {
        relationNodes.push({ id: laneId, type: 'relationLane', position: { x: centerX - requirementWidth / 2, y: laneCenterY(0, stories.length) - requirementHeight / 2 - 32 }, style: { width: requirementWidth }, selectable: false, draggable: false, zIndex: 1, data: { label } });
      }
    };
    addDependencyLane(inLane('PREREQUISITE'), -390, 'Pré-requisitos', 'lane-prerequisites');
    addDependencyLane(inLane('DEPENDENT'), 390, 'Dependentes', 'lane-dependents');

    const addBlockedLane = (stories: FocusedRelation[], centerX: number, laneId: string, label: string) => {
      if (!stories.length) return;
      const blockedStartY = dependencyBottom + 108;
      relationNodes.push({ id: laneId, type: 'relationLane', position: { x: centerX - requirementWidth / 2, y: blockedStartY - 34 }, style: { width: requirementWidth }, selectable: false, draggable: false, zIndex: 1, data: { label } });
      stories.forEach((entry, index) => {
        addRelationNode(entry, { x: centerX - requirementWidth / 2, y: blockedStartY + index * laneStep });
      });
    };
    const blocking = inLane('BLOCKS_CURRENT');
    const blocked = inLane('BLOCKED_BY_CURRENT');
    addBlockedLane(blocking, -390, 'lane-stories-blocking-root', 'Bloqueia esta US');
    addBlockedLane(blocked, 390, 'lane-stories-blocked-by-root', 'Bloqueada por esta US');

    const relatedStories = inLane('RELATED');
    if (relatedStories.length) {
      const columns = Math.min(3, relatedStories.length);
      const rows = Math.ceil(relatedStories.length / columns);
      const laneWidth = columns * requirementWidth + (columns - 1) * 48;
      const topCenterY = dependencyTop - 108 - requirementHeight / 2 - (rows - 1) * laneStep;
      relationNodes.push({ id: 'lane-related-stories', type: 'relationLane', position: { x: -laneWidth / 2, y: topCenterY - requirementHeight / 2 - 32 }, style: { width: laneWidth }, selectable: false, draggable: false, zIndex: 1, data: { label: 'Relacionadas' } });
      relatedStories.forEach((entry, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const centerX = (column - (columns - 1) / 2) * (requirementWidth + 48);
        const centerY = topCenterY + row * laneStep;
        addRelationNode(entry, { x: centerX - requirementWidth / 2, y: centerY - requirementHeight / 2 });
      });
    }
    relationNodes.push(focusedStoryNode(root, { x: -requirementWidth / 2, y: -requirementHeight / 2 }, 3));
    return relationNodes;
  }
  const visibleRequirements = requirements.filter((requirement) => visibleRequirementIds.has(requirement.id));
  const requirementFolderIds = new Set(visibleRequirements.map((requirement) => requirement.folderId));
  const visibleFolders = folders.filter((folder) => folder.name.trim().toLocaleLowerCase('pt-BR') !== 'sem pasta' || requirementFolderIds.has(folder.id));
  const selectedFolderId = selectedId ? visibleRequirements.find((requirement) => requirement.id === selectedId)?.folderId : undefined;
  const layouts = buildFolderLayouts(visibleFolders, visibleRequirements, collapsedFolderIds, storyOrderByFolder, selectedFolderId);
  const folderNodes: FolderFlowNode[] = [];
  const requirementNodes: RequirementFlowNode[] = [];
  const maxColumns = 3;
  let rowX = 0;
  let rowY = 0;
  let rowHeight = 0;
  let column = 0;

  layouts.forEach((layout) => {
    if (column >= maxColumns) {
      column = 0;
      rowX = 0;
      rowY += rowHeight + 44;
      rowHeight = 0;
    }
    appendFolder(layout, { x: rowX, y: rowY }, undefined);
    rowX += layout.width + 48;
    rowHeight = Math.max(rowHeight, layout.height);
    column += 1;
  });

  return [...folderNodes, ...requirementNodes];

  function appendFolder(layout: FolderLayout, position: { x: number; y: number }, parentId?: string) {
    const shownRequirements = layout.requirements.filter((requirement) => visibleRequirementIds.has(requirement.id) && graphNodeById.has(requirement.id));
    const contentStartY = folderHeaderHeight + layout.padding;
    const shownChildren = layout.children;
    folderNodes.push({
      id: layout.folder.id,
      type: 'folder',
      position,
      ...(parentId ? { parentId, extent: 'parent' as const } : {}),
      zIndex: -1,
      draggable: true,
      selectable: false,
      dragHandle: '.folder-map-node__header',
      style: { width: layout.width, height: layout.height },
      data: { name: layout.folder.name, description: layout.folder.description ?? '', requirementCount: shownRequirements.length, empty: shownRequirements.length === 0 && shownChildren.length === 0, collapsed: collapsedFolderIds.has(layout.folder.id), highlighted: layout.folder.id === selectedFolderId, defaultPosition: position, onToggle: onToggleFolder },
    });
    if (collapsedFolderIds.has(layout.folder.id)) return;
    shownRequirements.forEach((requirement, index) => {
      const id = requirement.id;
      const row = Math.floor(index / 2);
      const col = index % 2;
      const relativePosition = { x: layout.padding + col * (requirementWidth + folderGap), y: contentStartY + row * (requirementHeight + folderGap) };
      const graphNode = graphNodeById.get(id)!;
      requirementNodes.push({
        id,
        type: 'requirement',
        position: relativePosition,
        parentId: layout.folder.id,
        extent: 'parent',
        draggable: true,
        zIndex: 2,
        data: { ...graphNode, relationCount: relationCounts[id] ?? 0, matched: Boolean(normalized) && `${graphNode.code} ${graphNode.title}`.toLocaleLowerCase('pt-BR').includes(normalized), dimmed: Boolean(normalized) && !`${graphNode.code} ${graphNode.title}`.toLocaleLowerCase('pt-BR').includes(normalized), relationState: selectedId && id === selectedId ? 'selected' : selectedIds?.has(id) ? 'related' : 'idle' },
      });
    });
    let childY = contentStartY + Math.ceil(shownRequirements.length / 2) * (requirementHeight + folderGap);
    shownChildren.forEach((child) => {
      appendFolder(child, { x: layout.padding, y: childY }, layout.folder.id);
      childY += child.height + folderGap;
    });
  }

}

export function visibleMapEdges(data: GraphResponse, nodes: MapNode[], selectedId?: string | null, rootId?: string | null): Edge[] {
  const requirementIds = new Set(nodes.filter((node): node is RequirementFlowNode => node.type === 'requirement').map((node) => node.id));
  const focusedEdgeNodes = rootId ? new Map(data.edges.map((edge) => [edge.id, `focus-relation-${edge.id}`])) : null;
  const visibleEdges = data.edges.filter((edge) => rootId
    ? (edge.source === rootId || edge.target === rootId) && requirementIds.has(rootId) && requirementIds.has(focusedEdgeNodes!.get(edge.id)!)
    : requirementIds.has(edge.source) && requirementIds.has(edge.target));
  const edgesByPair = new Map<string, GraphResponse['edges']>();
  if (!rootId) visibleEdges.forEach((edge) => {
    const key = [edge.source, edge.target].sort().join(':');
    const group = edgesByPair.get(key);
    if (group) group.push(edge);
    else edgesByPair.set(key, [edge]);
  });
  const curveOffsets = new Map<string, number>();
  edgesByPair.forEach((group) => {
    if (group.length < 2) return;
    [...group].sort((a, b) => a.id.localeCompare(b.id)).forEach((edge, index) => curveOffsets.set(edge.id, (index - (group.length - 1) / 2) * 64));
  });
  return visibleEdges.map((edge) => {
    const highlighted = Boolean(selectedId && (edge.source === selectedId || edge.target === selectedId));
    const dependencyFlow = edge.type === 'DEPENDS_ON';
    const source = dependencyFlow ? edge.target : edge.source;
    const target = dependencyFlow ? edge.source : edge.target;
    const hasDirection = edge.type === 'DEPENDS_ON' || edge.type === 'BLOCKS';
    const curveOffset = curveOffsets.get(edge.id);
    return {
      id: edge.id,
      source: rootId && source !== rootId ? focusedEdgeNodes!.get(edge.id)! : source,
      target: rootId && target !== rootId ? focusedEdgeNodes!.get(edge.id)! : target,
      type: 'relation',
      data: { relationType: edge.type, curveOffset },
      label: edge.type === 'DEPENDS_ON' ? 'PRÉ-REQUISITO PARA' : edge.type === 'BLOCKS' ? 'BLOQUEIA' : 'RELACIONADO',
      labelStyle: { fontSize: 9, fontWeight: 600, fill: highlighted ? '#9a4f1e' : '#697580' },
      ...(hasDirection ? { markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: highlighted ? '#c76a27' : '#aeb5bd' } } : {}),
      style: { stroke: highlighted ? '#c76a27' : '#aeb5bd', strokeWidth: highlighted ? 2.4 : 1.2, opacity: selectedId && !highlighted ? 0.26 : 1 },
    } as Edge;
  });
}
