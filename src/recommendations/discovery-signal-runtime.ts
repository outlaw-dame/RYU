import { excludeFromDiscovery } from "../discovery/user-controls";
import { getDatabase } from "../db/client";
import type { Recommendation } from "../discovery/types";
import {
  migrateLegacyDiscoveryExclusions,
  type LegacyDiscoveryMigrationOptions,
  type LegacyDiscoveryMigrationResult
} from "./legacy-discovery-migration";
import type { UserRecommendationSignalDoc } from "./user-signal-schema";
import {
  listUserSignals,
  normalizeUserSignalScope,
  upsertUserSignal,
  type UserSignalQuery,
  type UserSignalScope
} from "./user-signal-store";
import type { UserSignalInput } from "./user-signals";

export type DiscoverySignalRuntimeDependencies = {
  migrateLegacy?: (
    options: LegacyDiscoveryMigrationOptions
  ) => Promise<LegacyDiscoveryMigrationResult>;
  listSignals?: (query: UserSignalQuery) => Promise<UserRecommendationSignalDoc[]>;
  writeSignal?: (
    input: UserSignalInput,
    options?: { now?: Date }
  ) => Promise<UserRecommendationSignalDoc>;
  writeLegacyExclusion?: (entityId: string) => unknown;
  resolveEntityType?: (entityId: string) => Promise<"author" | "edition" | null>;
};

export async function loadDiscoveryExclusionIds(
  scope: UserSignalScope,
  dependencies: DiscoverySignalRuntimeDependencies = {}
): Promise<string[]> {
  const canonicalScope = normalizeUserSignalScope(scope);
  const migrateLegacy = dependencies.migrateLegacy ?? migrateLegacyDiscoveryExclusions;
  const resolveEntityType = dependencies.resolveEntityType ?? resolveStoredRecommendationEntityType;

  await migrateLegacy({
    scope: canonicalScope,
    resolveEntityType
  });

  const signals = await (dependencies.listSignals ?? listUserSignals)({
    ...canonicalScope,
    signalType: "not_interested",
    provenance: "user_explicit"
  });

  return [...new Set(signals.map((signal) => signal.entityId))].sort();
}

export async function recordDiscoveryNotInterested(
  recommendation: Pick<Recommendation, "id" | "entityType">,
  scope: UserSignalScope,
  dependencies: DiscoverySignalRuntimeDependencies = {}
): Promise<void> {
  const canonicalScope = normalizeUserSignalScope(scope);
  const entityId = normalizeRecommendationId(recommendation.id);
  const writeLegacyExclusion = dependencies.writeLegacyExclusion ?? excludeFromDiscovery;

  writeLegacyExclusion(entityId);

  await (dependencies.writeSignal ?? upsertUserSignal)({
    ...canonicalScope,
    entityType: recommendation.entityType,
    entityId,
    signalType: "not_interested",
    strength: -1,
    provenance: "user_explicit",
    reason: "User dismissed this discovery recommendation"
  });
}

export function buildUserSignalScopeFromSession(session: {
  connected?: boolean;
  instanceOrigin?: string;
  account?: { id?: string } | null;
} | null | undefined): UserSignalScope | null {
  if (!session?.connected || !session.instanceOrigin || !session.account?.id) return null;
  return normalizeUserSignalScope({
    ownerAccountId: session.account.id,
    instanceOrigin: session.instanceOrigin
  });
}

async function resolveStoredRecommendationEntityType(
  entityId: string
): Promise<"author" | "edition" | null> {
  const id = normalizeRecommendationId(entityId);
  const db = await getDatabase();
  const [author, edition] = await Promise.all([
    db.authors.findOne(id).exec(),
    db.editions.findOne(id).exec()
  ]);

  if (author && edition) return null;
  if (author) return "author";
  if (edition) return "edition";
  return null;
}

function normalizeRecommendationId(value: string): string {
  const id = typeof value === "string" ? value.trim() : "";
  if (!id) throw new Error("Recommendation ID is required");
  if (id.length > 2048) throw new Error("Recommendation ID is too long");
  return id;
}
