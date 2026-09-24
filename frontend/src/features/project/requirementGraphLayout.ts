import { MarkerType, type Edge, type Node } from '@xyflow/react';
import type { GraphResponse, Requirement, RequirementFolder } from '../../lib/types';

export interface FolderNodeData extends Record<string, unknown> {
  name: string;
  description: string;
  requirementCount: number;
  empty: boolean;
  collapsed: boolean;
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
}

export type FolderFlowNode = Node<FolderNodeData, 'folder'>;
export type RequirementFlowNode = Node<RequirementNodeData, 'requirement'>;
export type MapNode = FolderFlowNode | RequirementFlowNode;

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

export function storyOrderIndex(position: { x: number; y: number }): number {
  const column = Math.max(0, Math.min(1, Math.round((position.x - folderPadding) / (requirementWidth + folderGap))));
  const row = Math.max(0, Math.round((position.y - folderHeaderHeight - folderPadding) / (requirementHeight + folderGap)));
  return row * 2 + column;
}

export function shouldUseMapPerformanceMode(storyCount: number, relationCount: number): boolean {
  return storyCount > 500 || relationCount > 1000;
}

interface FolderLayout {
  folder: RequirementFolder;
  requirements: Requirement[];
  children: FolderLayout[];
  width: number;
  height: number;
}

function buildFolderLayouts(folders: RequirementFolder[], requirements: Requirement[], collapsedFolderIds: ReadonlySet<string>, storyOrderByFolder: Record<string, string[]>): FolderLayout[] {
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
      width: Math.max(minimumFolderWidth, childrenWidth + folderPadding * 2),
      height: collapsed ? folderHeaderHeight : folderHeaderHeight + folderPadding * 2 + Math.max(requirementHeight, contentHeight),
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
  if (rootId) {
    const focusedStories = data.nodes.filter((node) => visibleRequirementIds.has(node.id));
    const neighbors = focusedStories.filter((node) => node.id !== rootId);
    const neighborIndex = new Map(neighbors.map((node, index) => [node.id, index]));
    const horizontalRadius = Math.max(300, neighbors.length * 100);
    const verticalRadius = Math.max(150, neighbors.length * 38);
    return focusedStories.map((node) => {
      const selected = node.id === rootId;
      const angle = neighbors.length ? -Math.PI / 2 + (neighborIndex.get(node.id) ?? 0) * (2 * Math.PI / neighbors.length) : 0;
      const position = selected
        ? { x: -requirementWidth / 2, y: -requirementHeight / 2 }
        : { x: Math.cos(angle) * horizontalRadius - requirementWidth / 2, y: Math.sin(angle) * verticalRadius - requirementHeight / 2 };
      const matched = !normalized || `${node.code} ${node.title}`.toLocaleLowerCase('pt-BR').includes(normalized);
      return {
        id: node.id,
        type: 'requirement' as const,
        position,
        zIndex: 2,
        draggable: false,
        data: { ...node, relationCount: relationCounts[node.id] ?? 0, matched: Boolean(normalized) && matched, dimmed: Boolean(normalized) && !matched, relationState: node.id === selectedId ? 'selected' as const : selectedIds?.has(node.id) ? 'related' as const : 'idle' as const },
      };
    });
  }
  const visibleRequirements = requirements.filter((requirement) => visibleRequirementIds.has(requirement.id));
  const requirementFolderIds = new Set(visibleRequirements.map((requirement) => requirement.folderId));
  const visibleFolders = folders.filter((folder) => folder.name.trim().toLocaleLowerCase('pt-BR') !== 'sem pasta' || requirementFolderIds.has(folder.id));
  const layouts = buildFolderLayouts(visibleFolders, visibleRequirements, collapsedFolderIds, storyOrderByFolder);
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
    const contentStartY = folderHeaderHeight + folderPadding;
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
      data: { name: layout.folder.name, description: layout.folder.description ?? '', requirementCount: shownRequirements.length, empty: shownRequirements.length === 0 && shownChildren.length === 0, collapsed: collapsedFolderIds.has(layout.folder.id), defaultPosition: position, onToggle: onToggleFolder },
    });
    if (collapsedFolderIds.has(layout.folder.id)) return;
    shownRequirements.forEach((requirement, index) => {
      const id = requirement.id;
      const row = Math.floor(index / 2);
      const col = index % 2;
      const relativePosition = { x: folderPadding + col * (requirementWidth + folderGap), y: contentStartY + row * (requirementHeight + folderGap) };
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
      appendFolder(child, { x: folderPadding, y: childY }, layout.folder.id);
      childY += child.height + folderGap;
    });
  }

}

export function visibleMapEdges(data: GraphResponse, nodes: MapNode[], selectedId?: string | null): Edge[] {
  const requirementIds = new Set(nodes.filter((node): node is RequirementFlowNode => node.type === 'requirement').map((node) => node.id));
  return data.edges.filter((edge) => requirementIds.has(edge.source) && requirementIds.has(edge.target)).map((edge) => {
    const highlighted = Boolean(selectedId && (edge.source === selectedId || edge.target === selectedId));
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'smoothstep',
      data: { relationType: edge.type },
      label: edge.type.replaceAll('_', ' '),
      labelStyle: { fontSize: 9, fontWeight: 600, fill: highlighted ? '#9a4f1e' : '#697580' },
      labelBgStyle: { fill: 'var(--surface)', fillOpacity: 0.96 },
      labelBgPadding: [5, 3],
      labelBgBorderRadius: 4,
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: highlighted ? '#c76a27' : '#aeb5bd' },
      style: { stroke: highlighted ? '#c76a27' : '#aeb5bd', strokeWidth: highlighted ? 2.4 : 1.2, opacity: selectedId && !highlighted ? 0.26 : 1 },
    } as Edge;
  });
}
