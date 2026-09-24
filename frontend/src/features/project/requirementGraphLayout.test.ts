import { describe, expect, it } from 'vitest';
import type { GraphResponse, Requirement, RequirementFolder } from '../../lib/types';
import { buildDefaultStoryOrder, buildRequirementMap, reorderStoryIds, shouldUseMapPerformanceMode, storyOrderIndex, visibleMapEdges, type RequirementFlowNode } from './requirementGraphLayout';

const folders: RequirementFolder[] = [
  { id: 'parent', workspaceId: 'w1', name: 'Produto' },
  { id: 'child', workspaceId: 'w1', parentId: 'parent', name: 'Conta' },
  { id: 'other', workspaceId: 'w1', name: 'Operações' },
  { id: 'empty', workspaceId: 'w1', name: 'Sem requisitos' },
];

const requirement = (id: string, folderId: string): Requirement => ({
  id, projectId: 'p1', code: `US-${id}`, type: 'USER_STORY', title: `História ${id}`,
  content: { type: 'doc' }, status: 'ACTIVE', folderId, source: 'MANUAL', revision: 1, criteria: [],
});

const requirements = [requirement('r1', 'parent'), requirement('r2', 'child'), requirement('r3', 'other'), requirement('r4', 'other'), requirement('r5', 'missing-folder')];
const graph: GraphResponse = {
  nodes: requirements.map(({ id, code, title, type, status }) => ({ id, code, title, type, status })),
  edges: [
    { id: 'e1', source: 'r1', target: 'r2', type: 'DEPENDS_ON' },
    { id: 'e2', source: 'r2', target: 'r3', type: 'RELATED_TO' },
  ],
};

function requirementNodes(nodes: ReturnType<typeof buildRequirementMap>): RequirementFlowNode[] {
  return nodes.filter((node): node is RequirementFlowNode => node.type === 'requirement');
}

describe('requirement map layout', () => {
  it('groups every active story under its folder, nests child folders, and handles missing folders', () => {
    const nodes = buildRequirementMap(graph, folders, requirements, '');
    const byId = new Map(nodes.map((node) => [node.id, node]));

    expect(byId.get('parent')?.type).toBe('folder');
    expect(byId.get('parent')?.draggable).toBe(true);
    expect(byId.get('parent')?.dragHandle).toBe('.folder-map-node__header');
    expect(byId.get('child')?.parentId).toBe('parent');
    expect(byId.get('r1')?.parentId).toBe('parent');
    expect(byId.get('r2')?.parentId).toBe('child');
    expect(byId.get('r3')?.parentId).toBe('other');
    expect(byId.get('r3')?.draggable).toBe(true);
    expect(byId.get('empty')?.type).toBe('folder');
    expect(byId.get('__unfiled__')?.type).toBe('folder');
    expect(byId.get('r5')?.parentId).toBe('__unfiled__');
  });

  it('shows only the selected story and directly related stories in focused mode', () => {
    const nodes = buildRequirementMap(graph, folders, requirements.slice(0, 4), '', 'r1', 'r1');
    const stories = requirementNodes(nodes);
    const ids = stories.map((node) => node.id).sort();
    const byId = new Map(stories.map((node) => [node.id, node]));

    expect(ids).toEqual(['r1', 'r2']);
    expect(byId.get('r1')?.data.relationState).toBe('selected');
    expect(byId.get('r2')?.data.relationState).toBe('related');
    expect(nodes.some((node) => node.type === 'folder')).toBe(false);
    expect(nodes.every((node) => !node.parentId)).toBe(true);
    expect(visibleMapEdges(graph, nodes, 'r1').map((edge) => edge.id)).toEqual(['e1']);
  });

  it('shows only a lone User Story in focused mode when it has no relations', () => {
    const nodes = buildRequirementMap(graph, folders, requirements, '', 'r4', 'r4');

    expect(nodes.map((node) => node.id)).toEqual(['r4']);
    expect(nodes[0].type).toBe('requirement');
    expect(nodes[0].data.relationState).toBe('selected');
  });

  it('keeps all stories visible when selecting inside the full board and highlights direct relations only', () => {
    const nodes = buildRequirementMap(graph, folders, requirements, '', null, 'r1');
    const byId = new Map(requirementNodes(nodes).map((node) => [node.id, node]));
    const edges = visibleMapEdges(graph, nodes, 'r1');

    expect([...byId.keys()].sort()).toEqual(['r1', 'r2', 'r3', 'r4', 'r5']);
    expect(byId.get('r3')?.data.relationState).toBe('idle');
    expect(edges.find((edge) => edge.id === 'e1')?.style).toMatchObject({ opacity: 1, stroke: '#c76a27' });
    expect(edges.find((edge) => edge.id === 'e2')?.style).toMatchObject({ opacity: 0.26 });
  });

  it('keeps empty folder groups available when the project has no requirements', () => {
    const nodes = buildRequirementMap({ nodes: [], edges: [] }, folders, [], '');

    expect(requirementNodes(nodes)).toEqual([]);
    expect(nodes.filter((node) => node.type === 'folder')).toHaveLength(folders.length);
  });

  it('collapses a folder to its header and hides its stories and subfolders', () => {
    const nodes = buildRequirementMap(graph, folders, requirements, '', null, null, new Set(['parent']));
    const folder = nodes.find((node) => node.id === 'parent');

    expect(folder?.type).toBe('folder');
    if (folder?.type === 'folder') {
      expect(folder.style?.height).toBe(48);
      expect(folder.data.collapsed).toBe(true);
    }
    expect(nodes.some((node) => node.id === 'r1' || node.id === 'r2' || node.id === 'child')).toBe(false);
  });

  it('hides the default Sem pasta group until it contains a story', () => {
    const defaultFolder = { id: 'default', workspaceId: 'w1', name: 'Sem pasta' };
    const withEmptyDefault = buildRequirementMap({ nodes: [], edges: [] }, [...folders, defaultFolder], [], '');
    const looseStory = requirement('loose', defaultFolder.id);
    const withStory = buildRequirementMap({ nodes: [{ id: looseStory.id, code: looseStory.code, title: looseStory.title, type: looseStory.type, status: looseStory.status }], edges: [] }, [...folders, defaultFolder], [looseStory], '');

    expect(withEmptyDefault.some((node) => node.id === defaultFolder.id)).toBe(false);
    expect(withStory.some((node) => node.id === defaultFolder.id)).toBe(true);
  });

  it('keeps a fixed 16px gap between story cards horizontally and vertically', () => {
    const stories = [requirement('a', 'other'), requirement('b', 'other'), requirement('c', 'other')];
    const graphData: GraphResponse = {
      nodes: stories.map(({ id, code, title, type, status }) => ({ id, code, title, type, status })),
      edges: [],
    };
    const positions = new Map(requirementNodes(buildRequirementMap(graphData, folders, stories, '')).map((node) => [node.id, node.position]));

    expect(positions.get('b')!.x - positions.get('a')!.x).toBe(220);
    expect(positions.get('c')!.y - positions.get('a')!.y).toBe(112);
  });

  it('reorders stories within a folder and maps a drop point to its fixed grid slot', () => {
    expect(reorderStoryIds(['r3', 'r4', 'r5'], 'r3', 1)).toEqual(['r4', 'r3', 'r5']);
    expect(storyOrderIndex({ x: 16, y: 64 })).toBe(0);
    expect(storyOrderIndex({ x: 236, y: 64 })).toBe(1);
    expect(storyOrderIndex({ x: 16, y: 176 })).toBe(2);
  });

  it('keeps default story order indexed by folder and places unfiled stories in their group', () => {
    expect(buildDefaultStoryOrder(requirements, folders)).toEqual({
      parent: ['r1'], child: ['r2'], other: ['r3', 'r4'], '__unfiled__': ['r5'],
    });
    const reordered = buildRequirementMap(graph, folders, requirements, '', null, null, new Set(), { other: ['r4', 'r3'] });
    const positions = new Map(requirementNodes(reordered).map((node) => [node.id, node.position]));
    expect(positions.get('r4')?.x).toBe(16);
    expect(positions.get('r3')?.x).toBe(236);
  });

  it('enables visible-only rendering only beyond the planned graph thresholds', () => {
    expect(shouldUseMapPerformanceMode(500, 1000)).toBe(false);
    expect(shouldUseMapPerformanceMode(501, 1)).toBe(true);
    expect(shouldUseMapPerformanceMode(1, 1001)).toBe(true);
  });

  it('builds the planned dense board without losing stories or relations', () => {
    const stories = Array.from({ length: 500 }, (_, index) => requirement(`dense-${index}`, 'other'));
    const denseGraph: GraphResponse = {
      nodes: stories.map(({ id, code, title, type, status }) => ({ id, code, title, type, status })),
      edges: Array.from({ length: 1000 }, (_, index) => ({
        id: `edge-${index}`,
        source: stories[index % stories.length].id,
        target: stories[(index + 1 + Math.floor(index / stories.length)) % stories.length].id,
        type: index % 2 ? 'RELATED_TO' : 'DEPENDS_ON',
      })),
    };
    const nodes = buildRequirementMap(denseGraph, folders, stories, '');

    expect(requirementNodes(nodes)).toHaveLength(500);
    expect(visibleMapEdges(denseGraph, nodes)).toHaveLength(1000);
    expect(shouldUseMapPerformanceMode(requirementNodes(nodes).length, denseGraph.edges.length)).toBe(false);
  });
});
