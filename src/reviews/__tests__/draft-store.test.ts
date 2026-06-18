import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  saveDraft,
  loadDraft,
  loadDraftsByEdition,
  loadAllDrafts,
  deleteDraft,
  hasDraft
} from '../draft-store';

describe('draft-store', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('saves and loads a draft', () => {
    const draft = saveDraft({
      editionId: 'edition-1',
      userId: 'user-1',
      contentType: 'review',
      title: 'Great book',
      content: 'I loved this book.',
      rating: 4,
      visibility: 'public'
    });

    expect(draft.id).toBeTruthy();
    expect(draft.editionId).toBe('edition-1');
    expect(draft.content).toBe('I loved this book.');

    const loaded = loadDraft(draft.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.title).toBe('Great book');
    expect(loaded!.rating).toBe(4);
  });

  it('returns null for non-existent draft', () => {
    expect(loadDraft('nonexistent')).toBeNull();
  });

  it('updates existing draft with same ID', () => {
    const first = saveDraft({
      editionId: 'edition-1',
      userId: 'user-1',
      contentType: 'review',
      title: 'v1',
      content: 'first version',
      rating: null,
      visibility: 'public'
    });

    const updated = saveDraft({
      id: first.id,
      editionId: 'edition-1',
      userId: 'user-1',
      contentType: 'review',
      title: 'v2',
      content: 'second version',
      rating: 5,
      visibility: 'private'
    });

    expect(updated.id).toBe(first.id);
    const loaded = loadDraft(first.id);
    expect(loaded!.title).toBe('v2');
    expect(loaded!.content).toBe('second version');
    expect(loaded!.visibility).toBe('private');
  });

  it('loads drafts by edition', () => {
    saveDraft({
      editionId: 'edition-1',
      userId: 'user-1',
      contentType: 'review',
      title: '',
      content: 'draft 1',
      rating: null,
      visibility: 'public'
    });
    saveDraft({
      editionId: 'edition-2',
      userId: 'user-1',
      contentType: 'note',
      title: '',
      content: 'draft 2',
      rating: null,
      visibility: 'private'
    });

    const edition1Drafts = loadDraftsByEdition('edition-1');
    expect(edition1Drafts).toHaveLength(1);
    expect(edition1Drafts[0].content).toBe('draft 1');
  });

  it('loads all drafts', () => {
    saveDraft({
      editionId: 'e1',
      userId: 'u1',
      contentType: 'review',
      title: '',
      content: 'a',
      rating: null,
      visibility: 'public'
    });
    saveDraft({
      editionId: 'e2',
      userId: 'u1',
      contentType: 'note',
      title: '',
      content: 'b',
      rating: null,
      visibility: 'private'
    });

    const all = loadAllDrafts();
    expect(all).toHaveLength(2);
  });

  it('deletes a draft', () => {
    const draft = saveDraft({
      editionId: 'e1',
      userId: 'u1',
      contentType: 'review',
      title: '',
      content: 'to delete',
      rating: null,
      visibility: 'public'
    });

    expect(hasDraft(draft.id)).toBe(true);

    deleteDraft(draft.id);

    expect(hasDraft(draft.id)).toBe(false);
    expect(loadDraft(draft.id)).toBeNull();
    expect(loadAllDrafts()).toHaveLength(0);
  });

  it('hasDraft returns false for non-existent draft', () => {
    expect(hasDraft('no-such-draft')).toBe(false);
  });
});
