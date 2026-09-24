import type { MapNode } from './requirementGraphLayout';

type Point = { x: number; y: number };

const gap = 28;
const cellSize = 256;

function sizeOf(node: MapNode) {
  return {
    width: Number(node.style?.width ?? node.measured?.width ?? (node.type === 'folder' ? 320 : 172)),
    height: Number(node.style?.height ?? node.measured?.height ?? (node.type === 'folder' ? 160 : 80)),
  };
}

export function resolveDraggedCollisions(nodes: MapNode[], draggedId: string, direction: Point): MapNode[] {
  const dragged = nodes.find((node) => node.id === draggedId);
  if (!dragged) return nodes;
  const blocks = nodes.filter((node) => node.type === dragged.type && node.parentId === dragged.parentId);
  if (blocks.length < 2) return nodes;

  const positions = new Map(blocks.map((node) => [node.id, node.position]));
  let moved = false;
  const maxPasses = Math.min(12, blocks.length);

  for (let pass = 0; pass < maxPasses; pass += 1) {
    let resolved = false;
    const buckets = new Map<string, MapNode[]>();
    for (const block of blocks) {
      const position = positions.get(block.id)!;
      const size = sizeOf(block);
      const minX = Math.floor((position.x - gap) / cellSize);
      const maxX = Math.floor((position.x + size.width + gap) / cellSize);
      const minY = Math.floor((position.y - gap) / cellSize);
      const maxY = Math.floor((position.y + size.height + gap) / cellSize);
      for (let x = minX; x <= maxX; x += 1) {
        for (let y = minY; y <= maxY; y += 1) {
          const key = `${x}:${y}`;
          const bucket = buckets.get(key);
          if (bucket) bucket.push(block);
          else buckets.set(key, [block]);
        }
      }
    }

    const checked = new Set<string>();
    for (const bucket of buckets.values()) {
      for (let i = 0; i < bucket.length; i += 1) {
        for (let j = i + 1; j < bucket.length; j += 1) {
          const first = bucket[i];
          const second = bucket[j];
          const pair = `${first.id}\0${second.id}`;
          if (checked.has(pair)) continue;
          checked.add(pair);

          const firstPosition = positions.get(first.id)!;
          const secondPosition = positions.get(second.id)!;
          const firstSize = sizeOf(first);
          const secondSize = sizeOf(second);
          const deltaX = secondPosition.x + secondSize.width / 2 - firstPosition.x - firstSize.width / 2;
          const deltaY = secondPosition.y + secondSize.height / 2 - firstPosition.y - firstSize.height / 2;
          const overlapX = (firstSize.width + secondSize.width) / 2 + gap - Math.abs(deltaX);
          const overlapY = (firstSize.height + secondSize.height) / 2 + gap - Math.abs(deltaY);
          if (overlapX <= 0.25 || overlapY <= 0.25) continue;

          const distance = Math.hypot(deltaX, deltaY);
          const fallback = Math.hypot(direction.x, direction.y);
          const unitX = distance > 0.001 ? deltaX / distance : fallback ? direction.x / fallback : 1;
          const unitY = distance > 0.001 ? deltaY / distance : fallback ? direction.y / fallback : 0;
          const xTravel = Math.abs(unitX) > 0.001 ? overlapX / Math.abs(unitX) : Infinity;
          const yTravel = Math.abs(unitY) > 0.001 ? overlapY / Math.abs(unitY) : Infinity;
          const travel = Math.min(xTravel, yTravel);
          if (!Number.isFinite(travel)) continue;

          // The dragged block stays under the pointer. Among the others, the
          // later block moves, so a chain settles without alternating directions.
          const moveSecond = second.id !== draggedId;
          const target = moveSecond ? second : first;
          const position = moveSecond ? secondPosition : firstPosition;
          const sign = moveSecond ? 1 : -1;
          positions.set(target.id, {
            x: position.x + unitX * travel * sign,
            y: position.y + unitY * travel * sign,
          });
          resolved = true;
          moved = true;
        }
      }
    }
    if (!resolved) break;
  }

  if (!moved) return nodes;
  return nodes.map((node) => {
    if (node.id === draggedId) return node;
    const position = positions.get(node.id);
    if (!position || (Math.abs(position.x - node.position.x) < 0.05 && Math.abs(position.y - node.position.y) < 0.05)) return node;
    return { ...node, position };
  });
}
