import { useEffect, useState } from "react";
import { getDatabase } from "../db/client";
import { isMigrationComplete, migrateModerationToRxDB } from "../moderation/migration";

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

export function useModerationMigration(ownerAccountId: string | null): MigrationStatus {
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

/** Test-only cleanup for module-level in-flight state. */
export function resetModerationMigrationInFlightForTests(): void {
  inFlightMigrations.clear();
}
