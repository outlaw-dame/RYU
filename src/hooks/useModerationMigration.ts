import { useEffect, useMemo, useState } from "react";
import { getDatabase } from "../db/client";
import { isMigrationComplete, migrateModerationToRxDB } from "../moderation/migration";
import { buildModerationOwnerIdentity } from "../moderation/owner-identity";
import { useMastodonSession } from "../sync/use-mastodon-activity";

export type MigrationStatus = "idle" | "running" | "complete" | "skipped" | "error";

/** Shared in-flight work prevents duplicate writes while allowing Strict Mode replay. */
const inFlightMigrations = new Map<string, Promise<"complete" | "skipped">>();

function runMigration(ownerAccountId: string): Promise<"complete" | "skipped"> {
  const existing = inFlightMigrations.get(ownerAccountId);
  if (existing) return existing;

  const promise = (async () => {
    if (isMigrationComplete(ownerAccountId)) return "complete" as const;
    const db = await getDatabase();
    const result = await migrateModerationToRxDB(db, ownerAccountId);
    return result === null ? "skipped" as const : "complete" as const;
  })().finally(() => {
    if (inFlightMigrations.get(ownerAccountId) === promise) {
      inFlightMigrations.delete(ownerAccountId);
    }
  });

  inFlightMigrations.set(ownerAccountId, promise);
  return promise;
}

/**
 * Trigger migration from the authenticated server session. The optional legacy
 * argument is intentionally ignored so older call sites cannot supply an
 * unscoped account name.
 */
export function useModerationMigration(_legacyOwnerAccountId?: string | null): MigrationStatus {
  const sessionQuery = useMastodonSession();
  const ownerAccountId = useMemo(
    () => buildModerationOwnerIdentity(sessionQuery.data),
    [sessionQuery.data]
  );
  const [status, setStatus] = useState<MigrationStatus>("idle");

  useEffect(() => {
    if (!ownerAccountId) {
      setStatus("idle");
      return;
    }

    let active = true;
    setStatus(isMigrationComplete(ownerAccountId) ? "complete" : "running");

    void runMigration(ownerAccountId).then(
      (next) => {
        if (active) setStatus(next);
      },
      () => {
        if (active) setStatus("error");
      }
    );

    return () => {
      active = false;
    };
  }, [ownerAccountId]);

  return status;
}

export function resetModerationMigrationInFlightForTests(): void {
  inFlightMigrations.clear();
}
