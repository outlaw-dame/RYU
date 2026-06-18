/**
 * Phase 32 - useComposer hook.
 *
 * Unified hook managing composer state for all modes (status, review, reply).
 * Handles: content, visibility, content warnings, drafts, validation,
 * and offline queueing via the existing publish-queue infrastructure.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type ComposerMode,
  type VisibilityOption,
  type ContentWarning,
  type DraftContent,
  COMPOSER_LIMITS,
  createInitialState,
  transition,
  isEditable,
  isPublishing as isPublishingPhase,
  getMaxLength,
  sanitizeContent,
  validateContent,
  getDefaultVisibility,
  toMastodonVisibility
} from '../composer';
import type { ComposerState } from '../composer';

const AUTOSAVE_INTERVAL_MS = 3000;
const DRAFT_KEY_PREFIX = 'ryu.composer-draft.';
const DRAFT_INDEX_KEY = 'ryu.composer-draft-index';

// --- Draft persistence helpers (localStorage) ---

function draftStorageKey(draftId: string): string {
  return `${DRAFT_KEY_PREFIX}${draftId}`;
}

function generateDraftId(): string {
  return `cdraft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function nowISO(): string {
  return new Date().toISOString();
}

function saveDraftToStorage(draft: DraftContent): boolean {
  try {
    window.localStorage.setItem(draftStorageKey(draft.id), JSON.stringify(draft));
    addDraftToIndex(draft.id);
    return true;
  } catch {
    return false;
  }
}

function loadDraftFromStorage(draftId: string): DraftContent | null {
  try {
    const raw = window.localStorage.getItem(draftStorageKey(draftId));
    if (!raw) return null;
    return JSON.parse(raw) as DraftContent;
  } catch {
    return null;
  }
}

function deleteDraftFromStorage(draftId: string): void {
  try {
    window.localStorage.removeItem(draftStorageKey(draftId));
    removeDraftFromIndex(draftId);
  } catch {
    // Best effort
  }
}

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
    // Best effort
  }
}

function addDraftToIndex(id: string): void {
  const ids = getDraftIndex();
  if (!ids.includes(id)) {
    ids.push(id);
    setDraftIndex(ids);
  }
}

function removeDraftFromIndex(id: string): void {
  const ids = getDraftIndex().filter((existing) => existing !== id);
  setDraftIndex(ids);
}

/**
 * Load all composer drafts for a given user.
 */
export function loadComposerDraftsByUser(userId: string): DraftContent[] {
  const ids = getDraftIndex();
  const drafts: DraftContent[] = [];
  for (const id of ids) {
    const draft = loadDraftFromStorage(id);
    if (draft && draft.userId === userId) {
      drafts.push(draft);
    }
  }
  return drafts;
}

// --- Hook types ---

export interface UseComposerOptions {
  mode: ComposerMode;
  userId: string;
  /** Existing draft to restore */
  existingDraftId?: string;
  /** For reply mode: the status being replied to */
  inReplyToId?: string;
  /** For review mode: the edition being reviewed */
  editionId?: string;
  /** Publish function to call (status post, review save, etc.) */
  onPublish?: (params: ComposerPublishParams) => Promise<void>;
  /** Called after successful publish */
  onPublished?: () => void;
  /** Called when discard is confirmed */
  onDiscarded?: () => void;
}

export interface ComposerPublishParams {
  mode: ComposerMode;
  text: string;
  title: string;
  visibility: string;
  spoilerText: string | null;
  inReplyToId: string | null;
  editionId: string | null;
  rating: number | null;
}

export interface UseComposerReturn {
  // Content
  text: string;
  setText: (text: string) => void;
  title: string;
  setTitle: (title: string) => void;
  rating: number | null;
  setRating: (rating: number | null) => void;
  // Visibility
  visibility: VisibilityOption;
  setVisibility: (v: VisibilityOption) => void;
  // Content warning
  contentWarning: ContentWarning;
  setContentWarning: (cw: ContentWarning) => void;
  // Draft state
  draftId: string | null;
  isDirty: boolean;
  lastSavedAt: string | null;
  // Machine state
  isPublishing: boolean;
  error: string | null;
  // Computed
  canPublish: boolean;
  canSaveDraft: boolean;
  maxLength: number;
  // Actions
  saveDraft: () => void;
  publish: () => Promise<void>;
  discard: () => void;
}

export function useComposer(options: UseComposerOptions): UseComposerReturn {
  const {
    mode,
    userId,
    existingDraftId,
    inReplyToId,
    editionId,
    onPublish,
    onPublished,
    onDiscarded
  } = options;

  // Content state
  const [text, setTextState] = useState('');
  const [title, setTitleState] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [visibility, setVisibility] = useState<VisibilityOption>(getDefaultVisibility());
  const [contentWarning, setContentWarning] = useState<ContentWarning>({ enabled: false, text: '' });

  // Draft tracking
  const [draftId, setDraftId] = useState<string | null>(existingDraftId ?? null);
  const [isDirty, setIsDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  // State machine
  const [machineState, setMachineState] = useState<ComposerState>(createInitialState());

  // Refs for unmount save
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  const textRef = useRef(text);
  textRef.current = text;
  const titleRef = useRef(title);
  titleRef.current = title;
  const ratingRef = useRef(rating);
  ratingRef.current = rating;
  const visibilityRef = useRef(visibility);
  visibilityRef.current = visibility;
  const contentWarningRef = useRef(contentWarning);
  contentWarningRef.current = contentWarning;
  const draftIdRef = useRef(draftId);
  draftIdRef.current = draftId;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const inReplyToIdRef = useRef(inReplyToId);
  inReplyToIdRef.current = inReplyToId;
  const editionIdRef = useRef(editionId);
  editionIdRef.current = editionId;

  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxLength = getMaxLength(mode);

  // Load existing draft on mount
  useEffect(() => {
    if (existingDraftId) {
      const draft = loadDraftFromStorage(existingDraftId);
      if (draft) {
        setDraftId(draft.id);
        setTextState(draft.text);
        setTitleState(draft.title);
        setRating(draft.rating);
        setVisibility(draft.visibility);
        setContentWarning(draft.contentWarning);
        setLastSavedAt(draft.savedAt);
      }
    }
  }, [existingDraftId]);

  // Auto-save when dirty
  useEffect(() => {
    if (!isDirty) return;

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = setTimeout(() => {
      const id = draftId ?? generateDraftId();
      const draft: DraftContent = {
        id,
        mode,
        text,
        title,
        visibility,
        contentWarning,
        attachments: [],
        inReplyToId: inReplyToId ?? null,
        editionId: editionId ?? null,
        rating,
        savedAt: nowISO(),
        userId
      };
      const saved = saveDraftToStorage(draft);
      if (saved) {
        setDraftId(id);
        setLastSavedAt(draft.savedAt);
        setIsDirty(false);
      }
    }, AUTOSAVE_INTERVAL_MS);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [isDirty, draftId, mode, text, title, visibility, contentWarning, inReplyToId, editionId, rating, userId]);

  // Save on unmount if dirty
  useEffect(() => {
    return () => {
      if (isDirtyRef.current) {
        const id = draftIdRef.current ?? generateDraftId();
        const draft: DraftContent = {
          id,
          mode: modeRef.current,
          text: textRef.current,
          title: titleRef.current,
          visibility: visibilityRef.current,
          contentWarning: contentWarningRef.current,
          attachments: [],
          inReplyToId: inReplyToIdRef.current ?? null,
          editionId: editionIdRef.current ?? null,
          rating: ratingRef.current,
          savedAt: nowISO(),
          userId: userIdRef.current
        };
        saveDraftToStorage(draft);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Content setters that mark dirty
  const setText = useCallback((value: string) => {
    setTextState(value);
    setIsDirty(true);
    setMachineState((s) => transition(s, { type: 'CONTENT_CHANGED' }));
  }, []);

  const setTitle = useCallback((value: string) => {
    setTitleState(value);
    setIsDirty(true);
    setMachineState((s) => transition(s, { type: 'CONTENT_CHANGED' }));
  }, []);

  const handleSetVisibility = useCallback((v: VisibilityOption) => {
    setVisibility(v);
    setIsDirty(true);
  }, []);

  const handleSetContentWarning = useCallback((cw: ContentWarning) => {
    setContentWarning(cw);
    setIsDirty(true);
  }, []);

  const handleSetRating = useCallback((r: number | null) => {
    setRating(r);
    setIsDirty(true);
  }, []);

  // Manual save draft
  const saveDraft = useCallback(() => {
    const id = draftId ?? generateDraftId();
    const draft: DraftContent = {
      id,
      mode,
      text,
      title,
      visibility,
      contentWarning,
      attachments: [],
      inReplyToId: inReplyToId ?? null,
      editionId: editionId ?? null,
      rating,
      savedAt: nowISO(),
      userId
    };
    saveDraftToStorage(draft);
    setDraftId(id);
    setLastSavedAt(draft.savedAt);
    setIsDirty(false);
  }, [draftId, mode, text, title, visibility, contentWarning, inReplyToId, editionId, rating, userId]);

  // Publish
  const publish = useCallback(async () => {
    // Transition to validating
    setMachineState((s) => transition(s, { type: 'REQUEST_PUBLISH' }));

    // Sanitize
    const sanitizedText = sanitizeContent(text);

    // Validate
    const validation = validateContent({
      mode,
      text: sanitizedText,
      title,
      contentWarning,
      attachmentCount: 0
    });

    if (!validation.valid) {
      const firstError = validation.errors[0]?.messageKey ?? 'composer.errors.unknown';
      setMachineState((s) => transition(s, { type: 'VALIDATION_FAILED', error: firstError }));
      return;
    }

    setMachineState((s) => transition(s, { type: 'VALIDATION_PASSED' }));

    try {
      if (onPublish) {
        await onPublish({
          mode,
          text: sanitizedText,
          title,
          visibility: toMastodonVisibility(visibility),
          spoilerText: contentWarning.enabled ? contentWarning.text.trim() : null,
          inReplyToId: inReplyToId ?? null,
          editionId: editionId ?? null,
          rating
        });
      }

      setMachineState((s) => transition(s, { type: 'PUBLISH_SUCCESS' }));

      // Clean up draft on success
      if (draftId) {
        deleteDraftFromStorage(draftId);
      }

      setIsDirty(false);
      onPublished?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Publish failed';
      setMachineState((s) => transition(s, { type: 'PUBLISH_FAILED', error: msg.slice(0, 240) }));
    }
  }, [text, title, mode, contentWarning, visibility, inReplyToId, editionId, rating, draftId, onPublish, onPublished]);

  // Discard
  const discard = useCallback(() => {
    if (draftId) {
      deleteDraftFromStorage(draftId);
    }
    setDraftId(null);
    setTextState('');
    setTitleState('');
    setRating(null);
    setVisibility(getDefaultVisibility());
    setContentWarning({ enabled: false, text: '' });
    setIsDirty(false);
    setLastSavedAt(null);
    setMachineState(createInitialState());
    onDiscarded?.();
  }, [draftId, onDiscarded]);

  // Computed
  const publishing = isPublishingPhase(machineState);
  const editable = isEditable(machineState);
  const hasContent = text.trim().length > 0;
  const withinLimit = text.length <= maxLength;
  const cwValid = !contentWarning.enabled || contentWarning.text.trim().length > 0;
  const canPublish = hasContent && withinLimit && cwValid && editable && !publishing;
  const canSaveDraft = isDirty && !publishing;

  return {
    text,
    setText,
    title,
    setTitle,
    rating,
    setRating: handleSetRating,
    visibility,
    setVisibility: handleSetVisibility,
    contentWarning,
    setContentWarning: handleSetContentWarning,
    draftId,
    isDirty,
    lastSavedAt,
    isPublishing: publishing,
    error: machineState.error,
    canPublish,
    canSaveDraft,
    maxLength,
    saveDraft,
    publish,
    discard
  };
}
