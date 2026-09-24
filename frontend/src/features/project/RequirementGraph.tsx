import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type WheelEvent } from 'react';
import { applyNodeChanges, Background, ControlButton, Controls, MiniMap, ReactFlow, type Edge, type NodeChange, type ReactFlowInstance, type Viewport } from '@xyflow/react';
import { Maximize2, Minus, Plus } from 'lucide-react';
import type { GraphResponse, Requirement, RequirementFolder } from '../../lib/types';
import { Icon } from '../../components/Icon';
import { FolderMapNode } from './FolderMapNode';
import { RequirementNode } from './RequirementNode';
import { resolveDraggedCollisions } from './requirementMapCollisions';
import { buildDefaultStoryOrder, buildRequirementMap, reorderStoryIds, shouldUseMapPerformanceMode, storyOrderIndex, visibleMapEdges, type MapNode } from './requirementGraphLayout';
import { readMapPreferences, readMapViewport, writeMapPreferences, writeMapViewport } from './requirementMapPreferences';

const nodeTypes = { folder: FolderMapNode, requirement: RequirementNode };

function sameNodeRecord(current: Record<string, unknown>, next: Record<string, unknown>): boolean {
  const keys = Object.keys(current);
  if (keys.length !== Object.keys(next).length) return false;
  return keys.every((key) => {
    if (key === 'defaultPosition') {
      const a = current[key] as { x: number; y: number } | undefined;
      const b = next[key] as { x: number; y: number } | undefined;
      return a?.x === b?.x && a?.y === b?.y;
    }
    return Object.is(current[key], next[key]);
  });
}

function sameMapNode(current: MapNode, next: MapNode): boolean {
  return current.id === next.id && current.type === next.type && current.parentId === next.parentId
    && Math.abs(current.position.x - next.position.x) < 0.1 && Math.abs(current.position.y - next.position.y) < 0.1
    && current.draggable === next.draggable && current.selectable === next.selectable
    && current.dragHandle === next.dragHandle && current.zIndex === next.zIndex
    && sameNodeRecord(current.data, next.data)
    && sameNodeRecord((current.style ?? {}) as Record<string, unknown>, (next.style ?? {}) as Record<string, unknown>);
}

export function RequirementGraph({ projectId, data, folders, requirements, query, rootId, selectedId, onSelect, darkMode = false }: {
  projectId: string;
  data: GraphResponse;
  folders: RequirementFolder[];
  requirements: Requirement[];
  query: string;
  rootId?: string | null;
  selectedId?: string | null;
  onSelect: (id: string) => void;
  darkMode?: boolean;
}) {
  const [savedLayout] = useState(() => readMapPreferences(projectId));
  const [savedViewport] = useState(() => readMapViewport(projectId));
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<ReadonlySet<string>>(() => new Set(savedLayout.collapsedFolderIds));
  const [folderPositions, setFolderPositions] = useState<Record<string, { x: number; y: number }>>(() => savedLayout.folderPositions);
  const [storyOrderByFolder, setStoryOrderByFolder] = useState<Record<string, string[]>>(() => savedLayout.storyOrderByFolder);
  const flowContainerRef = useRef<HTMLDivElement>(null);
  const wheelFrameRef = useRef<number | null>(null);
  const wheelDeltaRef = useRef(0);
  const wheelPointRef = useRef({ x: 0, y: 0 });
  const wheelTargetZoomRef = useRef<number | null>(null);
  const draggedNodeIdRef = useRef<string | null>(null);
  const lastDraggedPositionRef = useRef<{ x: number; y: number } | null>(null);
  const viewportRef = useRef<Viewport>(savedViewport ?? { x: 0, y: 0, zoom: 1 });
  const viewportSaveTimerRef = useRef<number | null>(null);
  const flowInstanceRef = useRef<ReactFlowInstance<MapNode, Edge> | null>(null);
  const skipInitialSave = useRef(true);
  const nodesRef = useRef<MapNode[]>([]);
  const toggleFolder = useCallback((id: string) => {
    setCollapsedFolderIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const defaultStoryOrder = useMemo(() => {
    if (rootId) return {};
    const visibleIds = new Set(data.nodes.map((node) => node.id));
    return buildDefaultStoryOrder(requirements.filter((requirement) => visibleIds.has(requirement.id)), folders);
  }, [rootId, data.nodes, requirements, folders]);
  const defaultStoryOrderRef = useRef(defaultStoryOrder);
  defaultStoryOrderRef.current = defaultStoryOrder;
  const commitStoryOrder = useCallback((folderId: string, nextOrder: string[]) => {
    const defaultOrder = defaultStoryOrderRef.current[folderId] ?? [];
    setStoryOrderByFolder((current) => {
      const next = { ...current };
      if (nextOrder.length === defaultOrder.length && nextOrder.every((storyId, index) => storyId === defaultOrder[index])) delete next[folderId];
      else next[folderId] = nextOrder;
      return next;
    });
  }, []);
  const reorderStory = useCallback((id: string, position: { x: number; y: number }) => {
    const dragged = nodesRef.current.find((node) => node.id === id && node.type === 'requirement');
    const folderId = dragged?.parentId;
    if (!dragged || !folderId) return;
    const currentOrder = nodesRef.current
      .filter((node): node is Extract<MapNode, { type: 'requirement' }> => node.type === 'requirement' && node.parentId === folderId)
      .sort((a, b) => {
        const positionA = a.id === id ? position : a.position;
        const positionB = b.id === id ? position : b.position;
        return positionA.y - positionB.y || positionA.x - positionB.x;
      })
      .map((node) => node.id);
    commitStoryOrder(folderId, reorderStoryIds(currentOrder, id, storyOrderIndex(position)));
  }, [commitStoryOrder]);
  const computedNodes = useMemo(() => buildRequirementMap(data, folders, requirements, query, rootId, selectedId, collapsedFolderIds, storyOrderByFolder, toggleFolder), [data, folders, requirements, query, rootId, selectedId, collapsedFolderIds, storyOrderByFolder, toggleFolder]);
  const positionedNodes = useMemo(() => computedNodes.map((node) => node.type === 'folder' && folderPositions[node.id] ? { ...node, position: folderPositions[node.id] } : node), [computedNodes, folderPositions]);
  const [nodes, setNodes] = useState<MapNode[]>(positionedNodes);
  nodesRef.current = nodes;
  const hasCustomStoryOrder = Object.entries(storyOrderByFolder).some(([folderId, order]) => {
    const baseline = defaultStoryOrder[folderId] ?? [];
    return order.length !== baseline.length || order.some((id, index) => id !== baseline[index]);
  });
  const hasCustomFolderPosition = rootId
    ? Object.keys(folderPositions).length > 0
    : computedNodes.some((node) => node.type === 'folder' && folderPositions[node.id] && (folderPositions[node.id].x !== node.position.x || folderPositions[node.id].y !== node.position.y));
  const hasCustomLayout = collapsedFolderIds.size > 0 || hasCustomFolderPosition || hasCustomStoryOrder;
  const [instance, setInstance] = useState<ReactFlowInstance<MapNode, Edge> | null>(null);
  const edges = useMemo(() => visibleMapEdges(data, computedNodes, selectedId), [data, computedNodes, selectedId]);
  const storyCount = computedNodes.reduce((count, node) => count + Number(node.type === 'requirement'), 0);
  const performanceMode = shouldUseMapPerformanceMode(storyCount, edges.length);
  const motionDuration = useCallback((duration: number) => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : duration, []);
  const handleNodesChange = useCallback((changes: NodeChange<MapNode>[]) => {
    const draggedId = draggedNodeIdRef.current;
    const dragChange = draggedId ? changes.find((change) => change.type === 'position' && change.id === draggedId && change.position) : undefined;
    if (!dragChange || dragChange.type !== 'position' || !dragChange.position) {
      setNodes((current) => applyNodeChanges(changes, current));
      return;
    }
    const previous = lastDraggedPositionRef.current;
    const direction = {
      x: dragChange.position.x - (previous?.x ?? dragChange.position.x),
      y: dragChange.position.y - (previous?.y ?? dragChange.position.y),
    };
    lastDraggedPositionRef.current = dragChange.position;
    setNodes((current) => resolveDraggedCollisions(applyNodeChanges(changes, current), dragChange.id, direction));
  }, []);
  const handleNodeClick = useCallback((_: React.MouseEvent, node: MapNode) => { if (node.type === 'requirement') onSelect(node.id); }, [onSelect]);
  const handleNodeDragStart = useCallback((_: MouseEvent | TouchEvent, node: MapNode) => {
    draggedNodeIdRef.current = node.id;
    lastDraggedPositionRef.current = node.position;
    flowContainerRef.current?.classList.add('is-dragging');
  }, []);
  const handleNodeDragStop = useCallback((_: MouseEvent | TouchEvent, node: MapNode) => {
    flowContainerRef.current?.classList.remove('is-dragging');
    draggedNodeIdRef.current = null;
    if (node.type === 'folder') {
      const movedFolders = nodesRef.current
        .filter((candidate): candidate is Extract<MapNode, { type: 'folder' }> => candidate.type === 'folder' && candidate.parentId === node.parentId)
        .map((candidate) => candidate.id === node.id ? node : candidate);
      if (!movedFolders.some((candidate) => candidate.id === node.id)) movedFolders.push(node);
      setFolderPositions((current) => {
        const next = { ...current };
        movedFolders.forEach((folder) => {
          if (Math.hypot(folder.position.x - folder.data.defaultPosition.x, folder.position.y - folder.data.defaultPosition.y) <= 1.5) delete next[folder.id];
          else next[folder.id] = folder.position;
        });
        return next;
      });
    } else if (!rootId) reorderStory(node.id, node.position);
    lastDraggedPositionRef.current = null;
  }, [rootId, reorderStory]);
  const miniMapNodeColor = useCallback((node: MapNode) => node.type === 'folder'
    ? (darkMode ? '#526575' : '#dfe5e8')
    : node.data.relationState === 'selected' ? '#c76a27' : node.data.relationState === 'related' ? '#668ca1' : (darkMode ? '#526575' : '#c8cdd3'), [darkMode]);
  const handleInit = useCallback((flow: ReactFlowInstance<MapNode, Edge>) => {
    flowInstanceRef.current = flow;
    viewportRef.current = flow.getViewport();
    setInstance(flow);
  }, []);
  const handleMove = useCallback((_: MouseEvent | TouchEvent | null, viewport: Viewport) => {
    viewportRef.current = viewport;
  }, []);
  const handleMoveEnd = useCallback((_: MouseEvent | TouchEvent | null, viewport: Viewport) => {
    viewportRef.current = viewport;
    if (viewportSaveTimerRef.current !== null) window.clearTimeout(viewportSaveTimerRef.current);
    viewportSaveTimerRef.current = window.setTimeout(() => {
      viewportSaveTimerRef.current = null;
      writeMapViewport(projectId, viewportRef.current);
    }, 160);
  }, [projectId]);

  const handleWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    if (!instance || !flowContainerRef.current || event.deltaY === 0) return;
    if (event.target instanceof Element && event.target.closest('.react-flow__controls, .react-flow__minimap, button')) return;
    event.preventDefault();
    const rect = flowContainerRef.current.getBoundingClientRect();
    const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? rect.height : 1;
    wheelDeltaRef.current += event.deltaY * unit;
    wheelPointRef.current = { x: event.clientX, y: event.clientY };
    if (wheelFrameRef.current !== null) return;
    const animateWheelZoom = () => {
      wheelFrameRef.current = window.requestAnimationFrame(() => {
        wheelFrameRef.current = null;
        const viewport = instance.getViewport();
        const delta = wheelDeltaRef.current;
        wheelDeltaRef.current = 0;
        const targetZoom = Math.min(1.6, Math.max(0.25, (wheelTargetZoomRef.current ?? viewport.zoom) * Math.exp(-delta * 0.001)));
        wheelTargetZoomRef.current = targetZoom;
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const easing = reduceMotion || performanceMode ? 1 : 0.34;
        const difference = targetZoom - viewport.zoom;
        const zoom = Math.abs(difference) < 0.001 || easing === 1 ? targetZoom : viewport.zoom + difference * easing;
        const point = wheelPointRef.current;
        const bounds = flowContainerRef.current?.getBoundingClientRect();
        if (!bounds) return;
        const x = point.x - bounds.left;
        const y = point.y - bounds.top;
        const worldX = (x - viewport.x) / viewport.zoom;
        const worldY = (y - viewport.y) / viewport.zoom;
        void instance.setViewport({ x: x - worldX * zoom, y: y - worldY * zoom, zoom });
        if (zoom === targetZoom) wheelTargetZoomRef.current = null;
        else animateWheelZoom();
      });
    };
    animateWheelZoom();
  }, [instance, performanceMode]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (!event.altKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || !(event.target instanceof Element)) return;
    const nodeId = event.target.closest('.react-flow__node-requirement')?.getAttribute('data-id');
    if (!nodeId) return;
    const currentNode = nodesRef.current.find((node) => node.id === nodeId && node.type === 'requirement');
    const folderId = currentNode?.parentId;
    if (!currentNode || !folderId) return;
    const siblings = nodesRef.current
      .filter((node): node is Extract<MapNode, { type: 'requirement' }> => node.type === 'requirement' && node.parentId === folderId)
      .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)
      .map((node) => node.id);
    const delta = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' ? -2 : 2;
    const targetIndex = Math.max(0, Math.min(siblings.length - 1, siblings.indexOf(nodeId) + delta));
    if (targetIndex === siblings.indexOf(nodeId)) return;
    event.preventDefault();
    commitStoryOrder(folderId, reorderStoryIds(siblings, nodeId, targetIndex));
  }, [commitStoryOrder]);

  useLayoutEffect(() => {
    setNodes((current) => {
      const byId = new Map(current.map((node) => [node.id, node]));
      let changed = current.length !== positionedNodes.length;
      const next = positionedNodes.map((node, index) => {
        const previous = byId.get(node.id);
        if (current[index]?.id !== node.id) changed = true;
        if (previous && sameMapNode(previous, node)) return previous;
        changed = true;
        return node;
      });
      return changed ? next : current;
    });
  }, [positionedNodes]);
  useEffect(() => {
    if (skipInitialSave.current) {
      skipInitialSave.current = false;
      return;
    }
    try {
      writeMapPreferences(projectId, { collapsedFolderIds: [...collapsedFolderIds], folderPositions, storyOrderByFolder }, hasCustomLayout);
    } catch { /* The map remains usable if browser storage is unavailable. */ }
  }, [projectId, collapsedFolderIds, folderPositions, storyOrderByFolder, hasCustomLayout]);
  useEffect(() => () => {
    if (wheelFrameRef.current !== null) window.cancelAnimationFrame(wheelFrameRef.current);
    if (viewportSaveTimerRef.current !== null) window.clearTimeout(viewportSaveTimerRef.current);
    const viewport = flowInstanceRef.current?.getViewport() ?? viewportRef.current;
    writeMapViewport(projectId, viewport);
  }, [projectId]);

  const hasRequirements = nodes.some((node) => node.type === 'requirement');
  if (!hasRequirements && !nodes.some((node) => node.type === 'folder')) return <div className="graph-empty"><span className="state-symbol"><Icon name="map" size={20}/></span><strong>Nenhum requisito para exibir</strong><span>Adicione o primeiro requisito para começar o mapa.</span></div>;

  return (
    <div ref={flowContainerRef} className={`graph-wrap ${rootId ? 'is-focused' : 'is-overview'} ${performanceMode ? 'is-performance-mode' : ''}`}>
      <ReactFlow<MapNode, Edge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onInit={handleInit}
        onMove={handleMove}
        onMoveEnd={handleMoveEnd}
        onNodesChange={handleNodesChange}
        onNodeClick={handleNodeClick}
        onNodeDragStart={handleNodeDragStart}
        onNodeDragStop={handleNodeDragStop}
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
        zoomOnScroll={false}
        onlyRenderVisibleElements={performanceMode}
        defaultViewport={savedViewport ?? { x: 0, y: 0, zoom: 1 }}
        fitView={!savedViewport} fitViewOptions={{ padding: 0.2, maxZoom: 1 }} minZoom={0.25} maxZoom={1.6}
        nodesConnectable={false}
        nodesDraggable
        elementsSelectable={false}
        aria-label="Mapa de User Stories agrupadas por pasta e suas relações"
      >
        <Background color={darkMode ? '#34414c' : '#d8dce1'} gap={20} size={1}/>
        <Controls position="bottom-left" showZoom={false} showFitView={false} showInteractive={false}>
          <ControlButton title="Aumentar zoom" aria-label="Aumentar zoom" onClick={() => { void instance?.zoomIn({ duration: motionDuration(180) }); }}><Plus size={15}/></ControlButton>
          <ControlButton title="Diminuir zoom" aria-label="Diminuir zoom" onClick={() => { void instance?.zoomOut({ duration: motionDuration(180) }); }}><Minus size={15}/></ControlButton>
          <ControlButton title="Enquadrar mapa" aria-label="Enquadrar mapa" onClick={() => { void instance?.fitView({ padding: 0.2, maxZoom: 1, duration: motionDuration(220) }); }}><Maximize2 size={14}/></ControlButton>
        </Controls>
        {!performanceMode && <MiniMap position="bottom-right" pannable zoomable bgColor={darkMode ? '#1c252e' : '#fff'} nodeColor={miniMapNodeColor} maskColor={darkMode ? 'rgba(17,23,29,.72)' : 'rgba(247,248,250,.72)'}/>}
      </ReactFlow>
      {!hasRequirements && <div className="graph-empty-hint" role="status">As pastas estão prontas para receber User Stories.</div>}
      {!rootId && hasCustomLayout && <button className="graph-reset-button" type="button" onClick={() => { setCollapsedFolderIds(new Set()); setFolderPositions({}); setStoryOrderByFolder({}); setNodes(computedNodes); window.setTimeout(() => instance?.fitView({ padding: 0.2, duration: motionDuration(220), maxZoom: 1 }), 20); }}><Icon name="refresh" size={13}/> Restaurar layout</button>}
    </div>
  );
}
