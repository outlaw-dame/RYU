/**
 * RxDB collections for local-first moderation store.
 *
 * Collections:
 * - moderationfilters: Keyword/phrase filters with contexts and actions
 * - moderationaccounts: Blocked/muted accounts
 * - moderationdomains: Domain-level blocks and silences
 * - moderationrelationships: Cached relationship state
 * - moderationreports: Filed reports
 * - moderationsyncstate: Sync tracking per data type per instance
 */

function passThrough<T>(doc: T): T { return doc; }

const version = 1;
const id = { type: "string", minLength: 1, maxLength: 2048 } as const;
const shortText = { type: "string", maxLength: 512 } as const;
const text = { type: "string", maxLength: 4096 } as const;
const longText = { type: "string", maxLength: 20000 } as const;
const timestamp = { type: "string", minLength: 20, maxLength: 40 } as const;
const optionalTimestamp = { type: "string", maxLength: 40 } as const;
const sourceEnum = { type: "string", enum: ["local", "remote"] } as const;

export const moderationCollections = {
  moderationfilters: {
    schema: {
      title: "moderation filters schema",
      version,
      type: "object",
      primaryKey: "id",
      additionalProperties: false,
      indexes: ["accountId", "source", "updatedAt"],
      properties: {
        id,
        title: text,
        keywords: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: shortText,
              keyword: text,
              wholeWord: { type: "boolean" }
            },
            required: ["id", "keyword", "wholeWord"]
          },
          default: []
        },
        contexts: {
          type: "array",
          items: { type: "string", enum: ["home", "notifications", "public", "thread", "account"] },
          default: []
        },
        action: { type: "string", enum: ["warn", "hide", "blur"] },
        expiresAt: optionalTimestamp,
        source: sourceEnum,
        remoteId: shortText,
        instanceOrigin: shortText,
        accountId: shortText,
        createdAt: timestamp,
        updatedAt: timestamp
      },
      required: ["id", "title", "keywords", "contexts", "action", "source", "createdAt", "updatedAt"]
    },
    migrationStrategies: { 1: passThrough }
  },

  moderationaccounts: {
    schema: {
      title: "moderation accounts schema",
      version,
      type: "object",
      primaryKey: "id",
      additionalProperties: false,
      indexes: ["accountId", "action", "source", "updatedAt"],
      properties: {
        id,
        accountId: id,
        acct: shortText,
        action: { type: "string", enum: ["block", "mute"] },
        hideNotifications: { type: "boolean" },
        expiresAt: optionalTimestamp,
        source: sourceEnum,
        remoteId: shortText,
        instanceOrigin: shortText,
        ownerAccountId: shortText,
        createdAt: timestamp,
        updatedAt: timestamp
      },
      required: ["id", "accountId", "action", "hideNotifications", "source", "createdAt", "updatedAt"]
    },
    migrationStrategies: { 1: passThrough }
  },

  moderationdomains: {
    schema: {
      title: "moderation domains schema",
      version,
      type: "object",
      primaryKey: "id",
      additionalProperties: false,
      indexes: ["domain", "severity", "source", "updatedAt"],
      properties: {
        id,
        domain: shortText,
        severity: { type: "string", enum: ["block", "silence", "hide_from_discovery"] },
        reason: text,
        source: sourceEnum,
        remoteId: shortText,
        instanceOrigin: shortText,
        accountId: shortText,
        createdAt: timestamp,
        updatedAt: timestamp
      },
      required: ["id", "domain", "severity", "source", "createdAt", "updatedAt"]
    },
    migrationStrategies: { 1: passThrough }
  },

  moderationrelationships: {
    schema: {
      title: "moderation relationships schema",
      version,
      type: "object",
      primaryKey: "id",
      additionalProperties: false,
      indexes: ["accountId", "instanceOrigin", "ownerAccountId", "syncedAt", "updatedAt"],
      properties: {
        id,
        accountId: id,
        following: { type: "boolean" },
        followedBy: { type: "boolean" },
        blocking: { type: "boolean" },
        blockedBy: { type: "boolean" },
        muting: { type: "boolean" },
        mutingNotifications: { type: "boolean" },
        requested: { type: "boolean" },
        requestedBy: { type: "boolean" },
        domainBlocking: { type: "boolean" },
        endorsed: { type: "boolean" },
        note: text,
        mutingExpiresAt: optionalTimestamp,
        instanceOrigin: shortText,
        ownerAccountId: shortText,
        syncedAt: timestamp,
        updatedAt: timestamp
      },
      required: [
        "id", "accountId", "following", "followedBy", "blocking", "blockedBy",
        "muting", "mutingNotifications", "requested", "requestedBy",
        "domainBlocking", "endorsed", "instanceOrigin", "ownerAccountId",
        "syncedAt", "updatedAt"
      ]
    },
    migrationStrategies: { 1: passThrough }
  },

  moderationreports: {
    schema: {
      title: "moderation reports schema",
      version,
      type: "object",
      primaryKey: "id",
      additionalProperties: false,
      indexes: ["targetAccountId", "status", "category", "updatedAt"],
      properties: {
        id,
        targetAccountId: id,
        statusIds: {
          type: "array",
          items: id,
          default: []
        },
        comment: longText,
        category: { type: "string", enum: ["spam", "violation", "legal", "other"] },
        ruleIds: {
          type: "array",
          items: shortText,
          default: []
        },
        forward: { type: "boolean" },
        status: { type: "string", enum: ["draft", "submitted", "resolved", "failed"] },
        remoteId: shortText,
        instanceOrigin: shortText,
        accountId: shortText,
        createdAt: timestamp,
        updatedAt: timestamp
      },
      required: ["id", "targetAccountId", "statusIds", "comment", "category", "ruleIds", "forward", "status", "createdAt", "updatedAt"]
    },
    migrationStrategies: { 1: passThrough }
  },

  moderationsyncstate: {
    schema: {
      title: "moderation sync state schema",
      version,
      type: "object",
      primaryKey: "id",
      additionalProperties: false,
      indexes: ["dataType", "instanceOrigin", "accountId", "syncedAt"],
      properties: {
        id,
        dataType: { type: "string", enum: ["filters", "accounts", "domains", "relationships", "reports"] },
        instanceOrigin: shortText,
        accountId: shortText,
        syncedAt: timestamp,
        nextSyncAt: optionalTimestamp,
        failureCount: { type: "number", minimum: 0, maximum: 1000 },
        updatedAt: timestamp
      },
      required: ["id", "dataType", "instanceOrigin", "accountId", "syncedAt", "failureCount", "updatedAt"]
    },
    migrationStrategies: { 1: passThrough }
  }
} as const;
