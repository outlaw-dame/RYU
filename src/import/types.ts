/**
 * Phase 26: Import queue types for library import hardening.
 *
 * Defines the shape of import jobs that flow through the persistent queue.
 */

export type ImportSource = 'bookwyrm' | 'openlibrary' | 'google_books' | 'isbn' | 'manual';

export type ImportJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type ImportJob = {
  /** Unique identifier for this import job */
  id: string;
  /** What triggered the import */
  source: ImportSource;
  /** Original input (URL, ISBN, or manual entry key) */
  input: string;
  /** Normalized canonical key for deduplication */
  canonicalKey: string;
  /** Current job status */
  status: ImportJobStatus;
  /** Number of processing attempts */
  attempts: number;
  /** Maximum attempts before permanent failure */
  maxAttempts: number;
  /** ISO timestamp when the job was created */
  createdAt: string;
  /** ISO timestamp of the last status change */
  updatedAt: string;
  /** ISO timestamp for when the next retry is allowed (if status is 'pending' after a failure) */
  nextRetryAt?: string;
  /** Error message from the last failed attempt */
  lastError?: string;
  /** ID of the resulting edition entity after successful import */
  resultEditionId?: string;
  /** Human-readable title (populated after first successful fetch or from manual input) */
  title?: string;
};

export type ImportQueueSnapshot = {
  jobs: ImportJob[];
  pending: number;
  processing: number;
  completed: number;
  failed: number;
};

export type ImportJobEvent =
  | { type: 'enqueued'; job: ImportJob }
  | { type: 'processing'; job: ImportJob }
  | { type: 'completed'; job: ImportJob }
  | { type: 'failed'; job: ImportJob }
  | { type: 'duplicate'; job: ImportJob; existingId: string };
