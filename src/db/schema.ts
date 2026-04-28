export type QueueStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type EntityType = 'author' | 'work' | 'edition' | 'review';
export type SearchVectorEntityType = 'author' | 'work' | 'edition';
export type ExternalEntitySource = 'wikidata' | 'dbpedia' | 'google_books' | 'open_library' | 'open_graph' | 'metron';

export interface AuthorDoc { id: string; name: string; summary?: string; url?: string; importedAt: string; updatedAt: string; }
export interface WorkDoc { id: string; title: string; summary?: string; authorIds: string[]; url?: string; importedAt: string; updatedAt: string; }
export interface EditionDoc { id: string; title: string; subtitle?: string; description?: string; authorIds: string[]; workId?: string; coverUrl?: string; isbn10?: string; isbn13?: string; sourceUrl: string; importedAt: string; updatedAt: string; }
export interface ReviewDoc { id: string; title?: string; content: string; editionId: string; accountId: string; rating?: number; published: string; importedAt: string; updatedAt: string; }
export interface EntityResolutionDoc { id: string; canonicalUri: string; entityType: EntityType; entityId: string; resolvedAt: string; }
export interface EntityLinkDoc { id: string; entityId: string; entityType: EntityType; source: ExternalEntitySource; externalId: string; externalUri: string; label?: string; description?: string; confidence: number; query: string; checkedAt: string; updatedAt: string; }
export interface BookWyrmInstanceDoc { id: string; domain: string; url: string; name: string; description?: string; users?: number; version?: string; registrationStatus: 'open' | 'invite' | 'closed' | 'unknown'; source: 'joinbookwyrm'; fetchedAt: string; updatedAt: string; }
export interface SearchVectorDoc { id: string; entityId: string; entityType: SearchVectorEntityType; model: string; dimensions: number; textHash: string; vector: number[]; indexedAt: string; updatedAt: string; }
export interface FetchQueueDoc { id: string; url: string; host: string; status: QueueStatus; attempts: number; lastAttemptAt?: string; nextAttemptAt?: string; error?: string; }
export interface WriteQueueDoc { id: string; operation: string; entityType: string; entityId: string; payload: string; status: QueueStatus; attempts: number; enqueuedAt: string; updatedAt: string; error?: string; }

const version = 1;
const id = { type: 'string', minLength: 1, maxLength: 2048 } as const;
const url = { type: 'string', minLength: 1, maxLength: 2048 } as const;
const shortText = { type: 'string', maxLength: 512 } as const;
const text = { type: 'string', maxLength: 4096 } as const;
const longText = { type: 'string', maxLength: 20000 } as const;
const timestamp = { type: 'string', minLength: 20, maxLength: 40 } as const;
const idList = { type: 'array', items: id, default: [] } as const;
const vector = { type: 'array', items: { type: 'number' }, default: [] } as const;
const queueStatus = { type: 'string', enum: ['pending', 'processing', 'completed', 'failed'] } as const;
const entityType = { type: 'string', enum: ['author', 'work', 'edition', 'review'] } as const;
const searchVectorEntityType = { type: 'string', enum: ['author', 'work', 'edition'] } as const;
const source = { type: 'string', enum: ['wikidata', 'dbpedia', 'google_books', 'open_library', 'open_graph', 'metron'] } as const;

function passThrough<T>(doc: T): T { return doc; }

export const collections = {
  authors: { schema: { title: 'authors schema', version, type: 'object', primaryKey: 'id', additionalProperties: false, indexes: ['name', 'updatedAt'], properties: { id, name: text, summary: longText, url, importedAt: timestamp, updatedAt: timestamp }, required: ['id', 'name', 'importedAt', 'updatedAt'] }, migrationStrategies: { 1: passThrough } },
  works: { schema: { title: 'works schema', version, type: 'object', primaryKey: 'id', additionalProperties: false, indexes: ['authorIds', 'updatedAt'], properties: { id, title: text, summary: longText, authorIds: idList, url, importedAt: timestamp, updatedAt: timestamp }, required: ['id', 'title', 'authorIds', 'importedAt', 'updatedAt'] }, migrationStrategies: { 1: passThrough } },
  editions: { schema: { title: 'editions schema', version, type: 'object', primaryKey: 'id', additionalProperties: false, indexes: ['authorIds', 'sourceUrl', 'workId', 'updatedAt'], properties: { id, title: text, subtitle: text, description: longText, authorIds: idList, workId: id, coverUrl: url, isbn10: shortText, isbn13: shortText, sourceUrl: url, importedAt: timestamp, updatedAt: timestamp }, required: ['id', 'title', 'authorIds', 'sourceUrl', 'importedAt', 'updatedAt'] }, migrationStrategies: { 1: passThrough } },
  reviews: { schema: { title: 'reviews schema', version, type: 'object', primaryKey: 'id', additionalProperties: false, indexes: ['editionId', 'accountId', 'published'], properties: { id, title: text, content: longText, editionId: id, accountId: id, rating: { type: 'number', minimum: 0, maximum: 5 }, published: timestamp, importedAt: timestamp, updatedAt: timestamp }, required: ['id', 'content', 'editionId', 'accountId', 'published', 'importedAt', 'updatedAt'] }, migrationStrategies: { 1: passThrough } },
  entityresolutions: { schema: { title: 'entity resolutions schema', version, type: 'object', primaryKey: 'id', additionalProperties: false, indexes: ['canonicalUri', 'entityType', 'resolvedAt'], properties: { id, canonicalUri: url, entityType, entityId: id, resolvedAt: timestamp }, required: ['id', 'canonicalUri', 'entityType', 'entityId', 'resolvedAt'] }, migrationStrategies: { 1: passThrough } },
  entitylinks: { schema: { title: 'external entity links schema', version, type: 'object', primaryKey: 'id', additionalProperties: false, indexes: ['entityId', 'entityType', 'source', 'externalUri', 'checkedAt'], properties: { id, entityId: id, entityType, source, externalId: shortText, externalUri: url, label: text, description: longText, confidence: { type: 'number', minimum: 0, maximum: 1 }, query: text, checkedAt: timestamp, updatedAt: timestamp }, required: ['id', 'entityId', 'entityType', 'source', 'externalId', 'externalUri', 'confidence', 'query', 'checkedAt', 'updatedAt'] }, migrationStrategies: { 1: passThrough } },
  bookwyrminstances: { schema: { title: 'bookwyrm instances schema', version, type: 'object', primaryKey: 'id', additionalProperties: false, indexes: ['domain', 'registrationStatus', 'users', 'updatedAt'], properties: { id, domain: shortText, url, name: text, description: longText, users: { type: 'number', minimum: 0, maximum: 100000000 }, version: shortText, registrationStatus: { type: 'string', enum: ['open', 'invite', 'closed', 'unknown'] }, source: { type: 'string', enum: ['joinbookwyrm'] }, fetchedAt: timestamp, updatedAt: timestamp }, required: ['id', 'domain', 'url', 'name', 'registrationStatus', 'source', 'fetchedAt', 'updatedAt'] }, migrationStrategies: { 1: passThrough } },
  searchvectors: { schema: { title: 'search vectors schema', version, type: 'object', primaryKey: 'id', additionalProperties: false, indexes: ['entityId', 'entityType', 'model', 'updatedAt'], properties: { id, entityId: id, entityType: searchVectorEntityType, model: shortText, dimensions: { type: 'number', minimum: 1, maximum: 4096 }, textHash: shortText, vector, indexedAt: timestamp, updatedAt: timestamp }, required: ['id', 'entityId', 'entityType', 'model', 'dimensions', 'textHash', 'vector', 'indexedAt', 'updatedAt'] }, migrationStrategies: { 1: passThrough } },
  fetchqueue: { schema: { title: 'fetch queue schema', version, type: 'object', primaryKey: 'id', additionalProperties: false, indexes: ['host', 'status', 'nextAttemptAt'], properties: { id, url, host: shortText, status: queueStatus, attempts: { type: 'number', minimum: 0, maximum: 1000 }, lastAttemptAt: timestamp, nextAttemptAt: timestamp, error: longText }, required: ['id', 'url', 'host', 'status', 'attempts'] }, migrationStrategies: { 1: passThrough } },
  writequeue: { schema: { title: 'write queue schema', version, type: 'object', primaryKey: 'id', additionalProperties: false, indexes: ['status', 'entityType', 'entityId', 'updatedAt'], properties: { id, operation: shortText, entityType: shortText, entityId: id, payload: longText, status: queueStatus, attempts: { type: 'number', minimum: 0, maximum: 1000 }, enqueuedAt: timestamp, updatedAt: timestamp, error: longText }, required: ['id', 'operation', 'entityType', 'entityId', 'payload', 'status', 'attempts', 'enqueuedAt', 'updatedAt'] }, migrationStrategies: { 1: passThrough } }
} as const;
