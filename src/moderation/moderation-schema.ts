/**
 * RxDB collections for local-first moderation store.
 *
 * Consolidated into 3 collections to stay within RxDB open-source
 * limit of 16 parallel collections (11 core + 3 moderation = 14).
 *
 * Collections:
 * - moderationpolicies: Polymorphic store for filters, account actions,
 *   domain blocks, and reports (discriminated by policyType)
 * - moderationrelationships: Cached relationship state per account
 * - moderationsyncstate: Sync tracking per data type per instance
 */

function passThrough<T>(doc: T): T { return doc; }

const version = 1;
const id = { type: "string", minLength: 1, maxLength: 2048 } as const;
const shortText = { type: "string", maxLength: 512 } as const;
const text = { type: "string", maxLength: 4096 } as const;
const longText = { type: "string", maxLength: 20000 } as const;
const timestamp = { type: "string", minLength: 20, maxLength: 40 } as const;
const sourceEnum = { type: "string", enum: ["local", "remote"] } as const;

export const moderationCollections = {
  /**
   * Polymorphic policy collection.
   *
   * policyType discriminates:
   * - "filter": keyword/phrase filter with contexts and actions
   * - "account_block": blocked account
   * - "account_mute": muted account (with optional expiry)
   * - "domain_block": domain-level block
   * - "report": filed report
   *
   * Shared fields: id, policyType, ownerAccountId, source, createdAt, updatedAt
   * Type-specific fields are optional (only populated for their policyType).
   */
  moderationpolicies: {
    schema: {
      title: "moderation policies schema",
      version,
      type: "object",
      primaryKey: "id",
      additionalProperties: false,
      indexes: ["policyType", "ownerAccountId", "source", "updatedAt"],
      properties: {
        id,
        policyType: { type: "string", enum: ["filter", "account_block", "account_mute", "domain_block", "report"] },
        ownerAccountId: shortText,
        source: sourceEnum,
        createdAt: timestamp,
        updatedAt: timestamp,

        // ─── Filter fields ────────────────────────────────────────
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
        filterAction: { type: "string", enum: ["warn", "hide", "blur"] },

        // ─── Account fields ───────────────────────────────────────
        accountId: shortText,
        acct: shortText,
        hideNotifications: { type: "boolean" },
        expiresAt: shortText,

        // ─── Domain fields ────────────────────────────────────────
        domain: shortText,
        severity: { type: "string", enum: ["block", "silence", "hide_from_discovery"] },
        reason: text,

        // ─── Report fields ────────────────────────────────────────
        targetAccountId: shortText,
        statusIds: { type: "array", items: id, default: [] },
        comment: longText,
        category: { type: "string", enum: ["spam", "violation", "legal", "other"] },
        ruleIds: { type: "array", items: shortText, default: [] },
        forward: { type: "boolean" },
        reportStatus: { type: "string", enum: ["draft", "submitted", "resolved", "failed"] },

        // ─── Shared optional fields ──────────────────────────────
        remoteId: shortText,
        instanceOrigin: shortText
      },
      required: ["id", "policyType", "ownerAccountId", "source", "createdAt", "updatedAt"]
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
      indexes: ["accountId", "ownerAccountId", "updatedAt"],
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
        mutingExpiresAt: shortText,
        instanceOrigin: shortText,
        ownerAccountId: shortText,
        syncedAt: timestamp,
        updatedAt: timestamp
      },
      required: [
        "id", "accountId", "following", "followedBy", "blocking", "blockedBy",
        "muting", "mutingNotifications", "requested", "requestedBy",
        "domainBlocking", "endorsed", "ownerAccountId",
        "syncedAt", "updatedAt"
      ]
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
      indexes: ["dataType", "accountId", "updatedAt"],
      properties: {
        id,
        dataType: { type: "string", enum: ["filters", "accounts", "domains", "relationships", "reports"] },
        instanceOrigin: shortText,
        accountId: shortText,
        syncedAt: timestamp,
        nextSyncAt: shortText,
        failureCount: { type: "number", minimum: 0, maximum: 1000 },
        updatedAt: timestamp
      },
      required: ["id", "dataType", "accountId", "syncedAt", "failureCount", "updatedAt"]
    },
    migrationStrategies: { 1: passThrough }
  }
} as const;
