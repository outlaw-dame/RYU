import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useComposer } from './useComposer';

// Mock i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' }
  })
}));

describe('useComposer', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
  });

  const defaultOptions = {
    mode: 'status' as const,
    userId: 'user-123'
  };

  it('initializes with empty state', () => {
    const { result } = renderHook(() => useComposer(defaultOptions));
    expect(result.current.text).toBe('');
    expect(result.current.title).toBe('');
    expect(result.current.visibility).toBe('public');
    expect(result.current.contentWarning.enabled).toBe(false);
    expect(result.current.isDirty).toBe(false);
    expect(result.current.isPublishing).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.canPublish).toBe(false);
    expect(result.current.maxLength).toBe(500);
  });

  it('sets text and marks dirty', () => {
    const { result } = renderHook(() => useComposer(defaultOptions));
    act(() => {
      result.current.setText('Hello world');
    });
    expect(result.current.text).toBe('Hello world');
    expect(result.current.isDirty).toBe(true);
    expect(result.current.canPublish).toBe(true);
  });

  it('auto-saves draft after interval', () => {
    const { result } = renderHook(() => useComposer(defaultOptions));
    act(() => {
      result.current.setText('auto save test');
    });
    expect(result.current.lastSavedAt).toBeNull();

    act(() => {
      vi.advanceTimersByTime(3500);
    });

    expect(result.current.lastSavedAt).not.toBeNull();
    expect(result.current.isDirty).toBe(false);
    expect(result.current.draftId).toBeTruthy();
  });

  it('manual saveDraft works', () => {
    const { result } = renderHook(() => useComposer(defaultOptions));
    act(() => {
      result.current.setText('manual save');
    });
    act(() => {
      result.current.saveDraft();
    });
    expect(result.current.isDirty).toBe(false);
    expect(result.current.draftId).toBeTruthy();
    expect(result.current.lastSavedAt).not.toBeNull();
  });

  it('discard clears state and removes draft', () => {
    const onDiscarded = vi.fn();
    const { result } = renderHook(() => useComposer({ ...defaultOptions, onDiscarded }));
    act(() => {
      result.current.setText('will discard');
      result.current.saveDraft();
    });
    const savedDraftId = result.current.draftId;
    expect(savedDraftId).toBeTruthy();

    act(() => {
      result.current.discard();
    });

    expect(result.current.text).toBe('');
    expect(result.current.draftId).toBeNull();
    expect(result.current.isDirty).toBe(false);
    expect(onDiscarded).toHaveBeenCalledTimes(1);
  });

  it('publish calls onPublish with correct params', async () => {
    const onPublish = vi.fn().mockResolvedValue(undefined);
    const onPublished = vi.fn();
    const { result } = renderHook(() =>
      useComposer({ ...defaultOptions, onPublish, onPublished })
    );

    act(() => {
      result.current.setText('Publishing this');
    });

    await act(async () => {
      await result.current.publish();
    });

    expect(onPublish).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'status',
        text: 'Publishing this',
        visibility: 'public',
        spoilerText: null
      })
    );
    expect(onPublished).toHaveBeenCalledTimes(1);
  });

  it('publish with CW includes spoiler text', async () => {
    const onPublish = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useComposer({ ...defaultOptions, onPublish })
    );

    act(() => {
      result.current.setText('CW post');
      result.current.setContentWarning({ enabled: true, text: 'Spoiler!' });
    });

    await act(async () => {
      await result.current.publish();
    });

    expect(onPublish).toHaveBeenCalledWith(
      expect.objectContaining({
        spoilerText: 'Spoiler!'
      })
    );
  });

  it('publish failure sets error state', async () => {
    const onPublish = vi.fn().mockRejectedValue(new Error('Network failed'));
    const { result } = renderHook(() =>
      useComposer({ ...defaultOptions, onPublish })
    );

    act(() => {
      result.current.setText('Will fail');
    });

    await act(async () => {
      await result.current.publish();
    });

    expect(result.current.error).toBe('Network failed');
    expect(result.current.isPublishing).toBe(false);
  });

  it('cannot publish empty text', () => {
    const { result } = renderHook(() => useComposer(defaultOptions));
    expect(result.current.canPublish).toBe(false);
  });

  it('cannot publish text over max length', () => {
    const { result } = renderHook(() => useComposer(defaultOptions));
    act(() => {
      result.current.setText('a'.repeat(501));
    });
    expect(result.current.canPublish).toBe(false);
  });

  it('cannot publish when CW enabled but text empty', () => {
    const { result } = renderHook(() => useComposer(defaultOptions));
    act(() => {
      result.current.setText('Has content');
      result.current.setContentWarning({ enabled: true, text: '' });
    });
    expect(result.current.canPublish).toBe(false);
  });

  it('review mode uses 5000 char limit', () => {
    const { result } = renderHook(() =>
      useComposer({ ...defaultOptions, mode: 'review' })
    );
    expect(result.current.maxLength).toBe(5000);
  });

  it('visibility change marks dirty', () => {
    const { result } = renderHook(() => useComposer(defaultOptions));
    act(() => {
      result.current.setVisibility('followers_only');
    });
    expect(result.current.visibility).toBe('followers_only');
    expect(result.current.isDirty).toBe(true);
  });

  it('restores existing draft on mount', () => {
    // Pre-save a draft
    const draftId = 'cdraft-test-123';
    const draft = {
      id: draftId,
      mode: 'status',
      text: 'Restored text',
      title: '',
      visibility: 'unlisted',
      contentWarning: { enabled: true, text: 'Spoiler' },
      attachments: [],
      inReplyToId: null,
      editionId: null,
      rating: null,
      savedAt: '2024-01-01T00:00:00.000Z',
      userId: 'user-123'
    };
    window.localStorage.setItem(`ryu.composer-draft.${draftId}`, JSON.stringify(draft));
    window.localStorage.setItem('ryu.composer-draft-index', JSON.stringify([draftId]));

    const { result } = renderHook(() =>
      useComposer({ ...defaultOptions, existingDraftId: draftId })
    );

    expect(result.current.text).toBe('Restored text');
    expect(result.current.visibility).toBe('unlisted');
    expect(result.current.contentWarning.enabled).toBe(true);
    expect(result.current.contentWarning.text).toBe('Spoiler');
    expect(result.current.lastSavedAt).toBe('2024-01-01T00:00:00.000Z');
  });
});
