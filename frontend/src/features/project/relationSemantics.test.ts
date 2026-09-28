import { describe, expect, it } from 'vitest';
import { relationDetails, relationKind, relationKinds, relationWrite } from './relationSemantics';

describe('relation semantics from the current US', () => {
  it('maps all five choices to the stored direction and an unambiguous sentence', () => {
    const expected = [
      ['PREREQUISITE', 'DEPENDS_ON', 'CURRENT_TO_OTHER', 'US-004 depende de US-003'],
      ['DEPENDENT', 'DEPENDS_ON', 'OTHER_TO_CURRENT', 'US-003 depende de US-004'],
      ['BLOCKS_CURRENT', 'BLOCKS', 'OTHER_TO_CURRENT', 'US-003 bloqueia US-004'],
      ['BLOCKED_BY_CURRENT', 'BLOCKS', 'CURRENT_TO_OTHER', 'US-004 bloqueia US-003'],
      ['RELATED', 'RELATED_TO', 'CURRENT_TO_OTHER', 'US-004 está relacionada à US-003'],
    ] as const;
    expect(relationKinds).toEqual(expected.map(([kind]) => kind));
    expected.forEach(([kind, type, direction, sentence]) => {
      expect(relationWrite(kind)).toEqual({ type, direction });
      expect(relationDetails(kind, 'US-004', 'US-003').sentence).toBe(sentence);
      const sourceId = direction === 'CURRENT_TO_OTHER' ? 'current' : 'other';
      const targetId = direction === 'CURRENT_TO_OTHER' ? 'other' : 'current';
      expect(relationKind(type, sourceId, targetId, 'current')).toBe(kind);
    });
  });
});
