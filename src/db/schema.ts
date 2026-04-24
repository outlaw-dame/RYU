export type QueueStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface InstanceDoc {
  id: string;
  url: string;
  softwareName?: string;
  softwareVersion?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccountDoc {
  id: string;
  handle: string;
  apId: string;
  instanceId: string;
  displayName?: string;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthorDoc {
  id: string;
  apId: string;
  name: string;
  summary?: string;
  url?: string;
  importedAt: string;
  updatedAt: string;
}

export interface WorkDoc {
  id: string;
  apId: string;
  title: string;
  summary?: string;
  url?: string;
  authorIds: string[];
  importedAt: string;
  updatedAt: string;
}

export interface EditionDoc {
  id: string;
  apId: string;
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

export interface StatusDoc {
  id: string;
  accountId: string;
  editionId?: string;
  type: string;
  content?: string;
  publishedAt: string;
  updatedAt: string;
}

export interface ShelfDoc {
  id: string;
  accountId: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShelfBookDoc {
  id: string;
  shelfId: string;
  editionId: string;
  addedAt: string;
}

export interface EntityResolutionDoc {
  id: string;
  canonicalUri: string;
  entityType: 'instance' | 'account' | 'author' | 'work' | 'edition' | 'status';
  entityId: string;
  resolvedAt: string;
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

const idField = { type: 'string', maxLength: 2048 };
const urlField = { type: 'string', maxLength: 2048 };
const shortTextField = { type: 'string', maxLength: 512 };
const mediumTextField = { type: 'string', maxLength: 4096 };
const longTextField = { type: 'string', maxLength: 20000 };
const timestampField = { type: 'string', minLength: 20, maxLength: 40 };
const queueStatusField = {
  type: 'string',
  enum: ['pending', 'processing', 'completed', 'failed'],
  maxLength: 32
};
const stringArrayField = {
  type: 'array',
  items: { type: 'string', maxLength: 2048 },
  default: []
};

export const collections = {
  instances: {
    schema: {
      title: 'instances schema',
      version: 0,
      type: 'object',
      primaryKey: 'id',
      additionalProperties: false,
      indexes: ['url', 'updatedAt'],
      properties: {
        id: idField,
        url: urlField,
        softwareName: shortTextField,
        softwareVersion: shortTextField,
        createdAt: timestampField,
        updatedAt: timestampField
      },
      required: ['id', 'url', 'createdAt', 'updatedAt']
    }
  },
  accounts: {
    schema: {
      title: 'accounts schema',
      version: 0,
      type: 'object',
      primaryKey: 'id',
      additionalProperties: false,
      indexes: ['handle', 'apId', 'instanceId', 'updatedAt'],
      properties: {
        id: idField,
        handle: shortTextField,
        apId: urlField,
        instanceId: idField,
        displayName: mediumTextField,
        avatarUrl: urlField,
        createdAt: timestampField,
        updatedAt: timestampField
      },
      required: ['id', 'handle', 'apId', 'instanceId', 'createdAt', 'updatedAt']
    }
  },
  works: {
    schema: {
      title: 'works schema',
      version: 0,
      type: 'object',
      primaryKey: 'id',
      additionalProperties: false,
      indexes: ['apId', 'importedAt', 'updatedAt'],
      properties: {
        id: idField,
        apId: urlField,
        title: mediumTextField,
        summary: longTextField,
        url: urlField,
        authorIds: stringArrayField,
        importedAt: timestampField,
        updatedAt: timestampField
      },
      required: ['id', 'apId', 'title', 'authorIds', 'importedAt', 'updatedAt']
    }
  },
  editions: {
    schema: {
      title: 'editions schema',
      version: 0,
      type: 'object',
      primaryKey: 'id',
      additionalProperties: false,
      indexes: ['apId', 'sourceUrl', 'workId', 'importedAt'],
      properties: {
        id: idField,
        apId: urlField,
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
      required: ['id', 'apId', 'title', 'authorIds', 'sourceUrl', 'importedAt', 'updatedAt']
    }
  },
  authors: {
    schema: {
      title: 'authors schema',
      version: 0,
      type: 'object',
      primaryKey: 'id',
      additionalProperties: false,
      indexes: ['apId', 'name', 'importedAt'],
      properties: {
        id: idField,
        apId: urlField,
        name: mediumTextField,
        summary: longTextField,
        url: urlField,
        importedAt: timestampField,
        updatedAt: timestampField
      },
      required: ['id', 'apId', 'name', 'importedAt', 'updatedAt']
    }
  },
  statuses: {
    schema: {
      title: 'statuses schema',
      version: 0,
      type: 'object',
      primaryKey: 'id',
      additionalProperties: false,
      indexes: ['accountId', 'publishedAt'],
      properties: {
        id: idField,
        accountId: idField,
        editionId: idField,
        type: shortTextField,
        content: longTextField,
        publishedAt: timestampField,
        updatedAt: timestampField
      },
      required: ['id', 'accountId', 'type', 'publishedAt', 'updatedAt']
    }
  },
  shelves: {
    schema: {
      title: 'shelves schema',
      version: 0,
      type: 'object',
      primaryKey: 'id',
      additionalProperties: false,
      indexes: ['accountId', 'name', 'updatedAt'],
      properties: {
        id: idField,
        accountId: idField,
        name: mediumTextField,
        description: longTextField,
        createdAt: timestampField,
        updatedAt: timestampField
      },
      required: ['id', 'accountId', 'name', 'createdAt', 'updatedAt']
    }
  },
  shelfbooks: {
    schema: {
      title: 'shelfbooks schema',
      version: 0,
      type: 'object',
      primaryKey: 'id',
      additionalProperties: false,
      indexes: ['shelfId', 'editionId', 'addedAt'],
      properties: {
        id: idField,
        shelfId: idField,
        editionId: idField,
        addedAt: timestampField
      },
      required: ['id', 'shelfId', 'editionId', 'addedAt']
    }
  },
  entityresolutions: {
    schema: {
      title: 'entity resolutions schema',
      version: 0,
      type: 'object',
      primaryKey: 'id',
      additionalProperties: false,
      indexes: ['canonicalUri', 'entityType', 'resolvedAt'],
      properties: {
        id: idField,
        canonicalUri: urlField,
        entityType: shortTextField,
        entityId: idField,
        resolvedAt: timestampField
      },
      required: ['id', 'canonicalUri', 'entityType', 'entityId', 'resolvedAt']
    }
  },
  fetchqueue: {
    schema: {
      title: 'fetch queue schema',
      version: 0,
      type: 'object',
      primaryKey: 'id',
      additionalProperties: false,
      indexes: ['host', 'status'],
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
    }
  },
  writequeue: {
    schema: {
      title: 'write queue schema',
      version: 0,
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
    }
  }
} as const;
