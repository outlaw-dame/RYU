import { useEffect, useMemo, useState } from "react";
import { getDatabase } from "../db/client";
import { isMigrationComplete, migrateModerationToRxDB } from "../moderation/migration";
import { buildModerationOwnerIdentity } from "../moderation/owner-identity";
import { useMastodonSession } from "../sync/use-mastodon-activity";

export type MigrationStatus = "idle" | "running" | "complete" | "skipped" | "error";

const inFlightMigrations = new Map<string, Promise<"complete" | "skipped">>();
const MAX_RETRY_ATTEMPTS = 5;
const BASE_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 8_000;

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

function retryDelay(attempt: number): number {
  const exponential = Math.min(
    MAX_RETRY_DELAY_MS,
    BASE_RETRY_DELAY_MS * 2 ** Math.max(0, attempt - 1)
  );
  return Math.round(exponential * (0.8 + Math.random() * 0.4));
}

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
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    const execute = () => {
      if (!active) return;
      setStatus(isMigrationComplete(ownerAccountId) ? "complete" : "running");
      void runMigration(ownerAccountId).then(
        (next) => {
          if (active) setStatus(next);
        },
        () => {
          if (!active) return;
          attempt += 1;
          if (attempt >= MAX_RETRY_ATTEMPTS) {
            setStatus("error");
            return;
          }
          setStatus("error");
          retryTimer = setTimeout(execute, retryDelay(attempt));
        }
      );
    };

    execute();

    return () => {
      active = false;
      if (retryTimer !== undefined) clearTimeout(retryTimer);
    };
  }, [ownerAccountId]);

  return status;
}

export function resetModerationMigrationInFlightForTests(): void {
  inFlightMigrations.clear();
}
