import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  transition,
  isEditable,
  canRequestPublish,
  isPublishing
} from '../composer-state';

describe('composer-state', () => {
  describe('createInitialState', () => {
    it('returns idle state with no error', () => {
      const state = createInitialState();
      expect(state.phase).toBe('idle');
      expect(state.error).toBeNull();
      expect(state.attempts).toBe(0);
    });
  });

  describe('transition', () => {
    it('moves from idle to editing on START_EDITING', () => {
      const state = createInitialState();
      const next = transition(state, { type: 'START_EDITING' });
      expect(next.phase).toBe('editing');
    });

    it('moves from idle to editing on CONTENT_CHANGED', () => {
      const state = createInitialState();
      const next = transition(state, { type: 'CONTENT_CHANGED' });
      expect(next.phase).toBe('editing');
    });

    it('moves from editing to validating on REQUEST_PUBLISH', () => {
      const state = transition(createInitialState(), { type: 'START_EDITING' });
      const next = transition(state, { type: 'REQUEST_PUBLISH' });
      expect(next.phase).toBe('validating');
    });

    it('moves from validating to publishing on VALIDATION_PASSED', () => {
      let state = transition(createInitialState(), { type: 'START_EDITING' });
      state = transition(state, { type: 'REQUEST_PUBLISH' });
      const next = transition(state, { type: 'VALIDATION_PASSED' });
      expect(next.phase).toBe('publishing');
      expect(next.attempts).toBe(1);
    });

    it('moves from validating to editing on VALIDATION_FAILED', () => {
      let state = transition(createInitialState(), { type: 'START_EDITING' });
      state = transition(state, { type: 'REQUEST_PUBLISH' });
      const next = transition(state, { type: 'VALIDATION_FAILED', error: 'test error' });
      expect(next.phase).toBe('editing');
      expect(next.error).toBe('test error');
    });

    it('moves from publishing to done on PUBLISH_SUCCESS', () => {
      let state = transition(createInitialState(), { type: 'START_EDITING' });
      state = transition(state, { type: 'REQUEST_PUBLISH' });
      state = transition(state, { type: 'VALIDATION_PASSED' });
      const next = transition(state, { type: 'PUBLISH_SUCCESS' });
      expect(next.phase).toBe('done');
      expect(next.error).toBeNull();
    });

    it('moves from publishing to error on PUBLISH_FAILED', () => {
      let state = transition(createInitialState(), { type: 'START_EDITING' });
      state = transition(state, { type: 'REQUEST_PUBLISH' });
      state = transition(state, { type: 'VALIDATION_PASSED' });
      const next = transition(state, { type: 'PUBLISH_FAILED', error: 'network error' });
      expect(next.phase).toBe('error');
      expect(next.error).toBe('network error');
    });

    it('moves from error to editing on RETRY', () => {
      let state = transition(createInitialState(), { type: 'START_EDITING' });
      state = transition(state, { type: 'REQUEST_PUBLISH' });
      state = transition(state, { type: 'VALIDATION_PASSED' });
      state = transition(state, { type: 'PUBLISH_FAILED', error: 'err' });
      const next = transition(state, { type: 'RETRY' });
      expect(next.phase).toBe('editing');
      expect(next.error).toBeNull();
    });

    it('RESET returns to initial state', () => {
      let state = transition(createInitialState(), { type: 'START_EDITING' });
      state = transition(state, { type: 'REQUEST_PUBLISH' });
      const next = transition(state, { type: 'RESET' });
      expect(next.phase).toBe('idle');
      expect(next.attempts).toBe(0);
    });

    it('ignores invalid transitions', () => {
      const state = createInitialState();
      const next = transition(state, { type: 'PUBLISH_SUCCESS' });
      expect(next).toBe(state);
    });
  });

  describe('isEditable', () => {
    it('returns true for idle, editing, and error', () => {
      expect(isEditable({ phase: 'idle', error: null, attempts: 0 })).toBe(true);
      expect(isEditable({ phase: 'editing', error: null, attempts: 0 })).toBe(true);
      expect(isEditable({ phase: 'error', error: 'err', attempts: 1 })).toBe(true);
    });

    it('returns false for validating, publishing, and done', () => {
      expect(isEditable({ phase: 'validating', error: null, attempts: 0 })).toBe(false);
      expect(isEditable({ phase: 'publishing', error: null, attempts: 1 })).toBe(false);
      expect(isEditable({ phase: 'done', error: null, attempts: 1 })).toBe(false);
    });
  });

  describe('canRequestPublish', () => {
    it('returns true only for editing phase', () => {
      expect(canRequestPublish({ phase: 'editing', error: null, attempts: 0 })).toBe(true);
      expect(canRequestPublish({ phase: 'idle', error: null, attempts: 0 })).toBe(false);
      expect(canRequestPublish({ phase: 'publishing', error: null, attempts: 1 })).toBe(false);
    });
  });

  describe('isPublishing', () => {
    it('returns true for validating and publishing phases', () => {
      expect(isPublishing({ phase: 'validating', error: null, attempts: 0 })).toBe(true);
      expect(isPublishing({ phase: 'publishing', error: null, attempts: 1 })).toBe(true);
      expect(isPublishing({ phase: 'editing', error: null, attempts: 0 })).toBe(false);
    });
  });
});
