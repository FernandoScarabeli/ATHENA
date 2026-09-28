import type { RelationType } from '../../lib/types';

export type RelationKind = 'PREREQUISITE' | 'DEPENDENT' | 'BLOCKS_CURRENT' | 'BLOCKED_BY_CURRENT' | 'RELATED';
export type RelationDirection = 'CURRENT_TO_OTHER' | 'OTHER_TO_CURRENT';

export const relationKinds: RelationKind[] = [
  'PREREQUISITE',
  'DEPENDENT',
  'BLOCKS_CURRENT',
  'BLOCKED_BY_CURRENT',
  'RELATED',
];

export function relationKind(type: RelationType, sourceId: string, targetId: string, currentId: string): RelationKind {
  if (type === 'RELATED_TO') return 'RELATED';
  const currentIsSource = sourceId === currentId;
  if (type === 'DEPENDS_ON') return currentIsSource ? 'PREREQUISITE' : 'DEPENDENT';
  return currentIsSource ? 'BLOCKED_BY_CURRENT' : 'BLOCKS_CURRENT';
}

export function relationDetails(kind: RelationKind, currentCode: string, otherCode: string): { title: string; sentence: string } {
  switch (kind) {
    case 'PREREQUISITE': return { title: 'Pré-requisito', sentence: `${currentCode} depende de ${otherCode}` };
    case 'DEPENDENT': return { title: 'Dependente', sentence: `${otherCode} depende de ${currentCode}` };
    case 'BLOCKS_CURRENT': return { title: 'Bloqueia esta US', sentence: `${otherCode} bloqueia ${currentCode}` };
    case 'BLOCKED_BY_CURRENT': return { title: 'Bloqueada por esta US', sentence: `${currentCode} bloqueia ${otherCode}` };
    case 'RELATED': return { title: 'Relacionada', sentence: `${currentCode} está relacionada à ${otherCode}` };
  }
}

export function relationWrite(kind: RelationKind): { type: RelationType; direction: RelationDirection } {
  switch (kind) {
    case 'PREREQUISITE': return { type: 'DEPENDS_ON', direction: 'CURRENT_TO_OTHER' };
    case 'DEPENDENT': return { type: 'DEPENDS_ON', direction: 'OTHER_TO_CURRENT' };
    case 'BLOCKS_CURRENT': return { type: 'BLOCKS', direction: 'OTHER_TO_CURRENT' };
    case 'BLOCKED_BY_CURRENT': return { type: 'BLOCKS', direction: 'CURRENT_TO_OTHER' };
    case 'RELATED': return { type: 'RELATED_TO', direction: 'CURRENT_TO_OTHER' };
  }
}
