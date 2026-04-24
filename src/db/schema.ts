export type QueueStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type ExternalEntitySource = 'wikidata' | 'dbpedia' | 'google_books' | 'open_library';

type MigrationDoc = Record<string, unknown> | null;

export interface AuthorDoc {
  id: string;
  name: string;
  summary?: string;
  url?: string;
  importedAt: string;
  updatedAt: string;
}

export interface WorkDoc {
  id: string;
  title: string;
  summary?: string;
  authorIds: string[];
  url?: string;
  importedAt: string;
  updatedAt: string;
}

export interface EditionDoc {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  authorIds: string[];
  workId?: string;
  coverUrl?: string;
  isbn10?: string;
  isbn13?: string;
  sourceUrl: string;
  importedAt: string;
  updatedAt: string;
}

export interface ReviewDoc {
  id: string;
  title?: string;
  content: string;
  editionId: string;
  accountId: string;
  rating?: number;
  published: string;
  importedAt: string;
  updatedAt: string;
}

export interface EntityResolutionDoc {
  id: string;
  canonicalUri: string;
  entityType: 'author' | 'work' | 'edition' | 'review';
  entityId: string;
  resolvedAt: string;
}

export interface EntityLinkDoc {
  id: string;
  entityId: string;
  entityType: 'author' | 'work' | 'edition' | 'review';
  source: ExternalEntitySource;
  externalId: string;
  externalUri: string;
  label?: string;
  description?: string;
  confidence: number;
  query: string;
  checkedAt: string;
  updatedAt: string;
}

export interface FetchQueueDoc {
  id: string;
  url: string;
  host: string;
  status: QueueStatus;
  attempts: number;
  lastAttemptAt?: string;
  nextAttemptAt?: string;
  error?: string;
}

export interface WriteQueueDoc {
  id: string;
  operation: string;
  entityType: string;
  entityId: string;
  payload: string;
  status: QueueStatus;
  attempts: number;
  enqueuedAt: string;
  updatedAt: string;
  error?: string;
}

const SCHEMA_VERSION = 1;

const idField = { type: 'string', minLength: 1, maxLength: 2048 };
const urlField = { type: 'string', minLength: 1, maxLength: 2048 };
const shortTextField = { type: 'string', maxLength: 512 };
const mediumTextField = { type: 'string', maxLength: 4096 };
const longTextField = { type: 'string', maxLength: 20000 };
const timestampField = { type: 'string', minLength: 20, maxLength: 40 };
const stringArrayField = {
  type: 'array',
  items: { type: 'string', minLength: 1, maxLength: 2048 },
  default: []
};
const queueStatusField = {
  type: 'string',
  enum: ['pending', 'processing', 'completed', 'failed']
};
const entityTypeField = {
  type: 'string',
  enum: ['author', 'work', 'edition', 'review']
};
const externalEntitySourceField = {
  type: 'string',
  enum: ['wikidata', 'dbpedia', 'google_books', 'open_library']
};

function identityMigration(doc: MigrationDoc): MigrationDoc {
  return doc;
}

function normalizeTimestamp(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length >= 20 ? value : fallback;
}

function ensureStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function migrateAuthorLikeV1(doc: MigrationDoc): MigrationDoc {
  if (!doc) return doc;
  const migratedAt = new Date().toISOString();
  return {
    ...doc,
    importedAt: normalizeTimestamp(doc.importedAt, migratedAt),
    updatedAt: normalizeTimestamp(doc.updatedAt, migratedAt)
  };
}

function migrateWorkV1(doc: MigrationDoc): MigrationDoc {
  if (!doc) return doc;
  const migratedAt = new Date().toISOString();
  return {
    ...doc,
    authorIds: ensureStringArray(doc.authorIds),
    importedAt: normalizeTimestamp(doc.importedAt, migratedAt),
    updatedAt: normalizeTimestamp(doc.updatedAt, migratedAt)
  };
}

function migrateEditionV1(doc: MigrationDoc): MigrationDoc {
  if (!doc) return doc;
  const migratedAt = new Date().toISOString();
  const workId = typeof doc.workId === 'string' ? doc.workId : undefined;
  return {
    ...doc,
    ...(workId ? { workId } : {}),
    authorIds: ensureStringArray(doc.authorIds),
    importedAt: normalizeTimestamp(doc.importedAt, migratedAt),
    updatedAt: normalizeTimestamp(doc.updatedAt, migratedAt)
  };
}

function migrateReviewV1(doc: MigrationDoc): MigrationDoc {
  if (!doc) return doc;
  const hasRequiredShape = typeof doc.id === 'string' && typeof doc.content === 'string' && typeof doc.editionId === 'string' && typeof doc.accountId === 'string';
  if (!hasRequiredShape) return null;
  const migratedAt = new Date().toISOString();
  return {
    ...doc,
    published: normalizeTimestamp(doc.published, migratedAt),
    importedAt: normalizeTimestamp(doc.importedAt, migratedAt),
    updatedAt: normalizeTimestamp(doc.updatedAt, migratedAt)
  };
}

export const collections = {
  authors: {
    schema: {
      title: 'authors schema',
      version: SCHEMA_VERSION,
      type: 'object',
      primaryKey: 'id',
      additionalProperties: false,
      indexes: ['name', 'updatedAt'],
      properties: {
        id: idField,
        name: mediumTextField,
        summary: longTextField,
        url: urlField,
        importedAt: timestampField,
        updatedAt: timestampField
      },
      required: ['id', 'name', 'importedAt', 'updatedAt']
    },
    migrationStrategies: { 1: migrateAuthorLikeV1 }
  },
  works: {
    schema: {
      title: 'works schema',
      version: SCHEMA_VERSION,
      type: 'object',
      primaryKey: 'id',
      additionalProperties: false,
      indexes: ['updatedAt'],
      properties: {
        id: idField,
        title: mediumTextField,
        summary: longTextField,
        authorIds: stringArrayField,
        url: urlField,
        importedAt: timestampField,
        updatedAt: timestampField
      },
      required: ['id', 'title', 'authorIds', 'importedAt', 'updatedAt']
    },
    migrationStrategies: { 1: migrateWorkV1 }
  },
  editions: {
    schema: {
      title: 'editions schema',
      version: SCHEMA_VERSION,
      type: 'object',
      primaryKey: 'id',
      additionalProperties: false,
      indexes: ['sourceUrl', 'workId', 'updatedAt'],
      properties: {
        id: idField,
        title: mediumTextField,
        subtitle: mediumTextField,
        description: longTextField,
        authorIds: stringArrayField,
        workId: idField,
        coverUrl: urlField,
        isbn10: shortTextField,
        isbn13: shortTextField,
        sourceUrl: urlField,
        importedAt: timestampField,
        updatedAt: timestampField
      },
      required: ['id', 'title', 'authorIds', 'sourceUrl', 'importedAt', 'updatedAt']
    },
    migrationStrategies: { 1: migrateEditionV1 }
  },
  reviews: {
    schema: {
      title: 'reviews schema',
      version: SCHEMA_VERSION,
      type: 'object',
      primaryKey: 'id',
      additionalProperties: false,
      indexes: ['editionId', 'accountId', 'published'],
      properties: {
        id: idField,
        title: mediumTextField,
        content: longTextField,
        editionId: idField,
        accountId: idField,
        rating: { type: 'number', minimum: 0, maximum: 5 },
        published: timestampField,
        importedAt: timestampField,
        updatedAt: timestampField
      },
      required: ['id', 'content', 'editionId', 'accountId', 'published', 'importedAt', 'updatedAt']
    },
    migrationStrategies: { 1: migrateReviewV1 }
  },
  entityresolutions: {
    schema: {
      title: 'entity resolutions schema',
      version: SCHEMA_VERSION,
      type: 'object',
      primaryKey: 'id',
      additionalProperties: false,
      indexes: ['canonicalUri', 'entityType', 'resolvedAt'],
      properties: {
        id: idField,
        canonicalUri: urlField,
        entityType: entityTypeField,
        entityId: idField,
        resolvedAt: timestampField
      },
      required: ['id', 'canonicalUri', 'entityType', 'entityId', 'resolvedAt']
    },
    migrationStrategies: { 1: identityMigration }
  },
  entitylinks: {
    schema: {
      title: 'external entity links schema',
      version: SCHEMA_VERSION,
      type: 'object',
      primaryKey: 'id',
      additionalProperties: false,
      indexes: ['entityId', 'entityType', 'source', 'externalUri', 'checkedAt'],
      properties: {
        id: idField,
        entityId: idField,
        entityType: entityTypeField,
        source: externalEntitySourceField,
        externalId: shortTextField,
        externalUri: urlField,
        label: mediumTextField,
        description: longTextField,
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        query: mediumTextField,
        checkedAt: timestampField,
        updatedAt: timestampField
      },
      required: ['id', 'entityId', 'entityType', 'source', 'externalId', 'externalUri', 'confidence', 'query', 'checkedAt', 'updatedAt']
    },
    migrationStrategies: { 1: identityMigration }
  },
  fetchqueue: {
    schema: {
      title: 'fetch queue schema',
      version: SCHEMA_VERSION,
      type: 'object',
      primaryKey: 'id',
      additionalProperties: false,
      indexes: ['host', 'status', 'nextAttemptAt'],
      properties: {
        id: idField,
        url: urlField,
        host: shortTextField,
        status: queueStatusField,
        attempts: { type: 'number', minimum: 0, maximum: 1000 },
        lastAttemptAt: timestampField,
        nextAttemptAt: timestampField,
        error: longTextField
      },
      required: ['id', 'url', 'host', 'status', 'attempts']
    },
    migrationStrategies: { 1: identityMigration }
  },
  writequeue: {
    schema: {
      title: 'write queue schema',
      version: SCHEMA_VERSION,
      type: 'object',
      primaryKey: 'id',
      additionalProperties: false,
      indexes: ['status', 'entityType', 'entityId', 'updatedAt'],
      properties: {
        id: idField,
        operation: shortTextField,
        entityType: shortTextField,
        entityId: idField,
        payload: longTextField,
        status: queueStatusField,
        attempts: { type: 'number', minimum: 0, maximum: 1000 },
        enqueuedAt: timestampField,
        updatedAt: timestampField,
        error: longTextField
      },
      required: ['id', 'operation', 'entityType', 'entityId', 'payload', 'status', 'attempts', 'enqueuedAt', 'updatedAt']
    },
    migrationStrategies: { 1: identityMigration }
  }
} as const;
