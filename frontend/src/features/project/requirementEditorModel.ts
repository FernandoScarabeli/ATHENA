import type { AcceptanceCriterion, Requirement } from '../../lib/types';

export type RequirementDraft = Pick<Requirement, 'title' | 'status' | 'folderId'> & {
  content: Record<string, unknown>;
  criteria: AcceptanceCriterion[];
};

export function isRequirementDirty(base: Requirement, draft: RequirementDraft): boolean {
  return draft.title !== base.title || draft.status !== base.status || draft.folderId !== base.folderId
    || JSON.stringify(normalizeCriteria(draft.criteria)) !== JSON.stringify(normalizeCriteria(base.criteria))
    || JSON.stringify(draft.content) !== JSON.stringify(base.content);
}

export function isSaveShortcut(event: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey' | 'key'>): boolean {
  return (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's';
}

export function requirementUpdatePayload(base: Requirement, draft: RequirementDraft) {
  return { revision: base.revision, title: draft.title, folderId: draft.folderId, content: draft.content,
    acceptanceCriteria: draft.criteria.filter((criterion) => Boolean(criterion.text?.trim() || criterion.title?.trim() || criterion.given?.trim() || criterion.whenText?.trim() || criterion.thenText?.trim())).map((criterion, position) => ({
      title: criterion.title?.trim() || undefined,
      given: criterion.given?.trim() || undefined,
      when: criterion.whenText?.trim() || undefined,
      then: criterion.thenText?.trim() || undefined,
      text: criterion.text?.trim() || criterion.thenText?.trim() || criterion.title?.trim() || '',
      content: criterion.content,
      position,
    })) };
}

function normalizeCriteria(criteria: AcceptanceCriterion[]) {
  return criteria.map(({ id: _id, position: _position, ...criterion }, position) => ({ ...criterion, position }));
}
