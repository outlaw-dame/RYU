/**
 * Phase 29 - useReviewComposer hook.
 *
 * Manages draft state, auto-save, publish, and delete flows for the review composer.
 * Provides a unified interface for both full reviews and quick notes.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { saveDraft, loadDraft, deleteDraft } from '../reviews/draft-store';
import { createReview, updateReview, deleteReview } from '../reviews/review-store';
import { enqueuePublish } from '../reviews/publish-queue';
import type { ReviewContentType, ReviewDraft, ReviewVisibility, LocalReview } from '../reviews/types';

const AUTOSAVE_INTERVAL_MS = 3000;

export type ReviewComposerState = {
  draftId: string | null;
  title: string;
  content: string;
  rating: number | null;
  visibility: ReviewVisibility;
  contentType: ReviewContentType;
  isDirty: boolean;
  isSaving: boolean;
  isPublishing: boolean;
  lastSavedAt: string | null;
  error: string | null;
};

export type ReviewComposerActions = {
  setTitle: (title: string) => void;
  setContent: (content: string) => void;
  setRating: (rating: number | null) => void;
  setVisibility: (visibility: ReviewVisibility) => void;
  saveDraft: () => ReviewDraft | null;
  publish: () => Promise<LocalReview | null>;
  discard: () => void;
  deleteExisting: (reviewId: string) => Promise<boolean>;
};

export type UseReviewComposerOptions = {
  editionId: string;
  userId: string;
  contentType?: ReviewContentType;
  existingDraftId?: string;
  existingReviewId?: string;
  onPublished?: (review: LocalReview) => void;
  onDiscarded?: () => void;
};

export function useReviewComposer(options: UseReviewComposerOptions): [ReviewComposerState, ReviewComposerActions] {
  const {
    editionId,
    userId,
    contentType = 'review',
    existingDraftId,
    existingReviewId,
    onPublished,
    onDiscarded
  } = options;

  const [draftId, setDraftId] = useState<string | null>(existingDraftId ?? null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [visibility, setVisibility] = useState<ReviewVisibility>(contentType === 'note' ? 'private' : 'public');
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  // Refs for unmount save to avoid stale closures
  const draftIdRef = useRef(draftId);
  draftIdRef.current = draftId;
  const titleRef = useRef(title);
  titleRef.current = title;
  const contentRef = useRef(content);
  contentRef.current = content;
  const ratingRef = useRef(rating);
  ratingRef.current = rating;
  const visibilityRef = useRef(visibility);
  visibilityRef.current = visibility;

  // Load existing draft on mount
  useEffect(() => {
    if (existingDraftId) {
      const draft = loadDraft(existingDraftId);
      if (draft) {
        setDraftId(draft.id);
        setTitle(draft.title);
        setContent(draft.content);
        setRating(draft.rating);
        setVisibility(draft.visibility);
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
      const draft = saveDraft({
        id: draftId ?? undefined,
        editionId,
        userId,
        contentType,
        title,
        content,
        rating,
        visibility
      });
      setDraftId(draft.id);
      setLastSavedAt(draft.savedAt);
      setIsDirty(false);
    }, AUTOSAVE_INTERVAL_MS);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [isDirty, draftId, editionId, userId, contentType, title, content, rating, visibility]);

  // Save synchronously on unmount if dirty to prevent losing last edits
  useEffect(() => {
    return () => {
      if (isDirtyRef.current) {
        saveDraft({
          id: draftIdRef.current ?? undefined,
          editionId,
          userId,
          contentType,
          title: titleRef.current,
          content: contentRef.current,
          rating: ratingRef.current,
          visibility: visibilityRef.current
        });
      }
    };
    // Only run cleanup on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editionId, userId, contentType]);

  const handleSetTitle = useCallback((value: string) => {
    setTitle(value);
    setIsDirty(true);
    setError(null);
  }, []);

  const handleSetContent = useCallback((value: string) => {
    setContent(value);
    setIsDirty(true);
    setError(null);
  }, []);

  const handleSetRating = useCallback((value: number | null) => {
    setRating(value);
    setIsDirty(true);
    setError(null);
  }, []);

  const handleSetVisibility = useCallback((value: ReviewVisibility) => {
    setVisibility(value);
    setIsDirty(true);
    setError(null);
  }, []);

  const handleSaveDraft = useCallback((): ReviewDraft | null => {
    setIsSaving(true);
    try {
      const draft = saveDraft({
        id: draftId ?? undefined,
        editionId,
        userId,
        contentType,
        title,
        content,
        rating,
        visibility
      });
      setDraftId(draft.id);
      setLastSavedAt(draft.savedAt);
      setIsDirty(false);
      return draft;
    } catch {
      setError('Failed to save draft');
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [draftId, editionId, userId, contentType, title, content, rating, visibility]);

  const handlePublish = useCallback(async (): Promise<LocalReview | null> => {
    if (!content.trim()) {
      setError('Content cannot be empty');
      return null;
    }

    setIsPublishing(true);
    setError(null);

    try {
      let review: LocalReview | null;

      if (existingReviewId) {
        review = await updateReview(existingReviewId, { title, content, rating, visibility });
      } else {
        review = await createReview({
          editionId,
          userId,
          contentType,
          title,
          content,
          rating,
          visibility
        });
      }

      if (!review) {
        setError('Failed to save review');
        return null;
      }

      // Queue for remote publishing if public
      if (visibility === 'public') {
        await enqueuePublish({
          reviewId: review.id,
          editionId,
          userId,
          action: existingReviewId ? 'update' : 'create',
          visibility,
          payload: { title, content, rating, editionId }
        });
      }

      // Clean up draft
      if (draftId) {
        deleteDraft(draftId);
      }

      setIsDirty(false);
      onPublished?.(review);
      return review;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Publish failed';
      setError(msg);
      return null;
    } finally {
      setIsPublishing(false);
    }
  }, [content, title, rating, visibility, editionId, userId, contentType, existingReviewId, draftId, onPublished]);

  const handleDiscard = useCallback(() => {
    if (draftId) {
      deleteDraft(draftId);
    }
    setDraftId(null);
    setTitle('');
    setContent('');
    setRating(null);
    setVisibility('public');
    setIsDirty(false);
    setError(null);
    setLastSavedAt(null);
    onDiscarded?.();
  }, [draftId, onDiscarded]);

  const handleDelete = useCallback(async (reviewId: string): Promise<boolean> => {
    try {
      const success = await deleteReview(reviewId);
      if (success && visibility === 'public') {
        await enqueuePublish({
          reviewId,
          editionId,
          userId,
          action: 'delete',
          visibility,
          payload: { reviewId, editionId }
        });
      }
      return success;
    } catch {
      setError('Failed to delete review');
      return false;
    }
  }, [editionId, userId, visibility]);

  const state: ReviewComposerState = {
    draftId,
    title,
    content,
    rating,
    visibility,
    contentType,
    isDirty,
    isSaving,
    isPublishing,
    lastSavedAt,
    error
  };

  const actions: ReviewComposerActions = {
    setTitle: handleSetTitle,
    setContent: handleSetContent,
    setRating: handleSetRating,
    setVisibility: handleSetVisibility,
    saveDraft: handleSaveDraft,
    publish: handlePublish,
    discard: handleDiscard,
    deleteExisting: handleDelete
  };

  return [state, actions];
}
