export { createImportQueue, getImportQueue, type ImportQueue, type ImportExecutor, type ImportQueueOptions } from './import-queue';
export { detectDuplicate, checkDuplicateByUri, checkDuplicateByIsbn, checkDuplicateByTitleAuthor, type DuplicateCheckResult } from './duplicate-detection';
export { resolveIsbn, isbnResultToApGraph, type IsbnLookupResult } from './isbn-resolver';
export type { ImportJob, ImportJobEvent, ImportJobStatus, ImportQueueSnapshot, ImportSource } from './types';
