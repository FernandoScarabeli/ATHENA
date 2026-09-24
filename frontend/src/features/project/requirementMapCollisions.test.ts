import { describe, expect, it } from 'vitest';
import type { MapNode } from './requirementGraphLayout';
import { resolveDraggedCollisions } from './requirementMapCollisions';

function folder(id: string, x: number, y: number): MapNode {
  return {
    id,
    type: 'folder',
    position: { x, y },
    style: { width: 100, height: 100 },
    data: { name: id, description: '', requirementCount: 0, empty: true, collapsed: false, defaultPosition: { x, y } },
  };
}

function separated(a: MapNode, b: MapNode): boolean {
  const gap = 28;
  return a.position.x + 100 + gap <= b.position.x
    || b.position.x + 100 + gap <= a.position.x
    || a.position.y + 100 + gap <= b.position.y
    || b.position.y + 100 + gap <= a.position.y;
}

describe('map collisions', () => {
  it('pushes a chain without moving the dragged folder and separates corner collisions diagonally', () => {
    const nodes = [folder('dragged', 100, 100), folder('second', 180, 180), folder('third', 270, 180)];
    const result = resolveDraggedCollisions(nodes, 'dragged', { x: 10, y: 10 });

    expect(result[0].position).toEqual(nodes[0].position);
    expect(result[1].position.x).not.toBe(nodes[1].position.x);
    expect(result[1].position.y).not.toBe(nodes[1].position.y);
    for (let i = 0; i < result.length; i += 1) {
      for (let j = i + 1; j < result.length; j += 1) expect(separated(result[i], result[j])).toBe(true);
    }
  });

  it('resolves overlaps between other folders and preserves untouched nodes', () => {
    const nodes = [folder('dragged', 0, 0), folder('second', 200, 0), folder('third', 250, 0)];
    const result = resolveDraggedCollisions(nodes, 'dragged', { x: 1, y: 0 });

    expect(result[0]).toBe(nodes[0]);
    expect(separated(result[1], result[2])).toBe(true);
    const clear = [folder('a', 0, 0), folder('b', 400, 0)];
    expect(resolveDraggedCollisions(clear, 'a', { x: 1, y: 0 })).toBe(clear);
  });
});
