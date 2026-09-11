import { describe, expect, it } from 'vitest';
import { isRequirementDirty, isSaveShortcut, requirementUpdatePayload } from './requirementEditorModel';
import type { Requirement } from '../../lib/types';

const base = { id: 'r', projectId: 'p', code: 'US-001', type: 'USER_STORY', title: 'Título', content: { type: 'doc' }, folderId: 'f', status: 'DRAFT', source: 'MANUAL', revision: 3, criteria: [{ id: 'c', text: 'Critério', position: 0 }] } as Requirement;
const draft = { title: base.title, status: base.status, folderId: base.folderId, content: base.content, criteria: [{ text: 'Critério', position: 0 }] };

describe('RequirementEditor model', () => {
  it('detects dirty fields and content', () => {
    expect(isRequirementDirty(base, draft)).toBe(false);
    expect(isRequirementDirty(base, { ...draft, content: { type: 'doc', content: [{ type: 'paragraph' }] } })).toBe(true);
  });
  it('recognizes Ctrl/Cmd+S only', () => {
    expect(isSaveShortcut({ ctrlKey: true, metaKey: false, key: 's' })).toBe(true);
    expect(isSaveShortcut({ ctrlKey: false, metaKey: false, key: 's' })).toBe(false);
  });
  it('creates revisioned REST payload with positioned criteria', () => {
    const payload = requirementUpdatePayload(base, { ...draft, criteria: [{ title: 'A', given: 'um contexto', whenText: 'uma ação', thenText: 'um resultado', position: 0 }, { text: 'B', position: 1 }] });
    expect(payload).toMatchObject({ revision: 3, content: base.content, folderId: 'f' });
    expect(payload.acceptanceCriteria).toEqual([{ title: 'A', given: 'um contexto', when: 'uma ação', then: 'um resultado', text: 'um resultado', content: undefined, position: 0 }, { title: undefined, given: undefined, when: undefined, then: undefined, text: 'B', content: undefined, position: 1 }]);
  });
});
