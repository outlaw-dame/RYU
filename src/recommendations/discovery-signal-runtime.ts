import { excludeFromDiscovery } from "../discovery/user-controls";
import { getDatabase } from "../db/client";
import type { Recommendation } from "../discovery/types";
import { migrateLegacyDiscoveryExclusions } from "./legacy-discovery-migration";
import {
  listUserSignals,
  normalizeUserSignalScope,
  upsertUserSignal,
  type UserSignalScope
} from "./user-signal-store";

export type DiscoverySignalRuntimeDependencies = {
  migrateLegacy?: typeof migrateLegacyDiscoveryExclusions;
  listSignals?: typeof listUserSignals;
  writeSignal?: typeof upsertUserSignal;
  writeLegacyExclusion?: typeof excludeFromDiscovery;
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

/**
 * Immediately preserves the existing local fallback, then writes the durable,
 * account-scoped preference. The recommendation's entity type comes from the
 * generated recommendation object and is never inferred from an untrusted ID.
 */
export async function recordDiscoveryNotInterested(
  recommendation: Pick<Recommendation, "id" | "entityType">,
  scope: UserSignalScope,
  dependencies: DiscoverySignalRuntimeDependencies = {}
): Promise<void> {
  const canonicalScope = normalizeUserSignalScope(scope);
  const entityId = normalizeRecommendationId(recommendation.id);
  const writeLegacyExclusion = dependencies.writeLegacyExclusion ?? excludeFromDiscovery;

  // Keep the established fallback until the durable path has shipped broadly
  // and migration telemetry-free verification is complete.
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
