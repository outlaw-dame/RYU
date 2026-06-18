/**
 * Phase 29 - Draft store.
 *
 * Persists review/note drafts in localStorage for auto-save and recovery.
 * Drafts survive app close, page refresh, and offline scenarios.
 */

import type { ReviewContentType, ReviewDraft, ReviewVisibility } from './types';

const DRAFT_KEY_PREFIX = 'ryu.review-draft.';
const DRAFT_INDEX_KEY = 'ryu.review-draft-index';

function draftKey(draftId: string): string {
  return `${DRAFT_KEY_PREFIX}${draftId}`;
}

function nowISO(): string {
  return new Date().toISOString();
}

function generateDraftId(): string {
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Save or update a draft in localStorage.
 * If no draftId is provided, generates a new one.
 */
export function saveDraft(input: {
  id?: string;
  editionId: string;
  userId: string;
  contentType: ReviewContentType;
  title: string;
  content: string;
  rating: number | null;
  visibility: ReviewVisibility;
}): ReviewDraft {
  const id = input.id || generateDraftId();
  const draft: ReviewDraft = {
    id,
    editionId: input.editionId,
    userId: input.userId,
    contentType: input.contentType,
    title: input.title,
    content: input.content,
    rating: input.rating,
    visibility: input.visibility,
    savedAt: nowISO()
  };

  try {
    window.localStorage.setItem(draftKey(id), JSON.stringify(draft));
    addToIndex(id);
  } catch {
    // Storage full or unavailable -- best effort.
  }

  return draft;
}

/**
 * Load a single draft by ID.
 */
export function loadDraft(draftId: string): ReviewDraft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(draftId));
    if (!raw) return null;
    return JSON.parse(raw) as ReviewDraft;
  } catch {
    return null;
  }
}

/**
 * Load all drafts for a given edition.
 */
export function loadDraftsByEdition(editionId: string): ReviewDraft[] {
  const allDrafts = loadAllDrafts();
  return allDrafts.filter((d) => d.editionId === editionId);
}

/**
 * Load all drafts for a given user.
 */
export function loadDraftsByUser(userId: string): ReviewDraft[] {
  const allDrafts = loadAllDrafts();
  return allDrafts.filter((d) => d.userId === userId);
}

/**
 * Load all drafts currently stored.
 */
export function loadAllDrafts(): ReviewDraft[] {
  const ids = getDraftIndex();
  const drafts: ReviewDraft[] = [];

  for (const id of ids) {
    const draft = loadDraft(id);
    if (draft) {
      drafts.push(draft);
    }
  }

  return drafts;
}

/**
 * Delete a draft from localStorage.
 */
export function deleteDraft(draftId: string): void {
  try {
    window.localStorage.removeItem(draftKey(draftId));
    removeFromIndex(draftId);
  } catch {
    // Best effort.
  }
}

/**
 * Check if a draft exists for a given ID.
 */
export function hasDraft(draftId: string): boolean {
  try {
    return window.localStorage.getItem(draftKey(draftId)) !== null;
  } catch {
    return false;
  }
}

// --- Index management ---

function getDraftIndex(): string[] {
  try {
    const raw = window.localStorage.getItem(DRAFT_INDEX_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function setDraftIndex(ids: string[]): void {
  try {
    window.localStorage.setItem(DRAFT_INDEX_KEY, JSON.stringify(ids));
  } catch {
    // Best effort.
  }
}

function addToIndex(id: string): void {
  const ids = getDraftIndex();
  if (!ids.includes(id)) {
    ids.push(id);
    setDraftIndex(ids);
  }
}

function removeFromIndex(id: string): void {
  const ids = getDraftIndex().filter((existing) => existing !== id);
  setDraftIndex(ids);
}
