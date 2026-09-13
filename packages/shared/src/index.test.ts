import { describe, expect, it } from 'vitest';
import { aiSuggestionStatuses, aiSuggestionTypes, commentThreadStatuses, notificationTypes, requirementStatuses, workspaceRoles } from './index.js';
import type { ApiError, CommentAnchor, CreateCommentPayload, RequirementResponse } from './index.js';

describe('shared transport contracts', () => {
  it('keeps the product vocabulary stable, including VIEWER commenting', () => {
    expect(workspaceRoles).toEqual(['OWNER', 'EDITOR', 'VIEWER']);
    expect(requirementStatuses).toEqual(['DRAFT', 'ACTIVE', 'ARCHIVED']);
    expect(commentThreadStatuses).toEqual(['OPEN', 'RESOLVED']);
    expect(notificationTypes).toEqual(['MENTION']);
  });

  it('publishes AI suggestion state and kinds without making them canonical relations', () => {
    expect(aiSuggestionTypes).toEqual(['RELATION', 'REFERENCE']);
    expect(aiSuggestionStatuses).toEqual(['PENDING', 'CONFIRMED', 'DISMISSED']);
  });

  it('models optional anchors and the documented error envelope', () => {
    const anchor: CommentAnchor = { from: 1, to: 4, quote: 'texto' };
    const payload: CreateCommentPayload = { body: 'comentário', anchor, mentionedUserIds: [] };
    const error: ApiError = { error: { code: 'REQUEST_ERROR', message: 'inválido', details: { field: 'body' } } };
    expect(payload.anchor?.quote).toBe('texto');
    expect(error.error.details).toEqual({ field: 'body' });
  });

  it('makes criteria and references part of the requirement response contract', () => {
    const requirement: RequirementResponse = {
      id: 'r', projectId: 'p', code: 'US-001', type: 'USER_STORY', title: 't', content: { type: 'doc' },
      status: 'DRAFT', folderId: 'f', source: 'MANUAL', revision: 1,
      criteria: [{ text: 'critério', position: 0, given: null, whenText: null, thenText: null }],
      references: [],
    };
    expect(requirement.criteria[0].text).toBe('critério');
    expect(requirement.references).toEqual([]);
  });
});
