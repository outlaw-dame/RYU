/**
 * Phase 32 - Composer state machine.
 *
 * Manages the lifecycle of a compose session:
 * idle -> editing -> validating -> publishing -> done/error
 *
 * The state machine ensures that drafts are never lost during transitions
 * and that the UI can accurately reflect the current phase.
 */

/**
 * Possible states for the composer lifecycle.
 */
export type ComposerPhase =
  | 'idle'
  | 'editing'
  | 'validating'
  | 'publishing'
  | 'done'
  | 'error';

/**
 * Events that drive state transitions.
 */
export type ComposerEvent =
  | { type: 'START_EDITING' }
  | { type: 'CONTENT_CHANGED' }
  | { type: 'REQUEST_PUBLISH' }
  | { type: 'VALIDATION_PASSED' }
  | { type: 'VALIDATION_FAILED'; error: string }
  | { type: 'PUBLISH_SUCCESS' }
  | { type: 'PUBLISH_FAILED'; error: string }
  | { type: 'RETRY' }
  | { type: 'RESET' };

/**
 * Composer state object.
 */
export interface ComposerState {
  phase: ComposerPhase;
  error: string | null;
  /** Number of publish attempts (for retry tracking) */
  attempts: number;
}

/**
 * Initial state for a new composer session.
 */
export function createInitialState(): ComposerState {
  return {
    phase: 'idle',
    error: null,
    attempts: 0
  };
}

/**
 * Pure state transition function.
 * Returns a new state given the current state and an event.
 */
export function transition(state: ComposerState, event: ComposerEvent): ComposerState {
  switch (event.type) {
    case 'START_EDITING':
      if (state.phase === 'idle' || state.phase === 'done' || state.phase === 'error') {
        return { phase: 'editing', error: null, attempts: 0 };
      }
      return state;

    case 'CONTENT_CHANGED':
      if (state.phase === 'idle') {
        return { phase: 'editing', error: null, attempts: 0 };
      }
      if (state.phase === 'error') {
        return { ...state, phase: 'editing', error: null };
      }
      return state;

    case 'REQUEST_PUBLISH':
      if (state.phase === 'editing') {
        return { ...state, phase: 'validating', error: null };
      }
      return state;

    case 'VALIDATION_PASSED':
      if (state.phase === 'validating') {
        return { ...state, phase: 'publishing', error: null, attempts: state.attempts + 1 };
      }
      return state;

    case 'VALIDATION_FAILED':
      if (state.phase === 'validating') {
        return { ...state, phase: 'editing', error: event.error };
      }
      return state;

    case 'PUBLISH_SUCCESS':
      if (state.phase === 'publishing') {
        return { phase: 'done', error: null, attempts: state.attempts };
      }
      return state;

    case 'PUBLISH_FAILED':
      if (state.phase === 'publishing') {
        return { ...state, phase: 'error', error: event.error };
      }
      return state;

    case 'RETRY':
      if (state.phase === 'error') {
        return { ...state, phase: 'editing', error: null };
      }
      return state;

    case 'RESET':
      return createInitialState();

    default:
      return state;
  }
}

/**
 * Returns true when the composer is in a phase where user input is allowed.
 */
export function isEditable(state: ComposerState): boolean {
  return state.phase === 'idle' || state.phase === 'editing' || state.phase === 'error';
}

/**
 * Returns true when the publish button should be available.
 */
export function canRequestPublish(state: ComposerState): boolean {
  return state.phase === 'editing';
}

/**
 * Returns true when the composer is actively publishing (for loading indicators).
 */
export function isPublishing(state: ComposerState): boolean {
  return state.phase === 'publishing' || state.phase === 'validating';
}
