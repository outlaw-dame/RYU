/**
 * useModerationMigration — triggers localStorage→RxDB migration once.
 *
 * Fires when:
 * 1. The database is initialized (moderationpolicies collection available)
 * 2. The user's session is known (ownerAccountId is available)
 *
 * The migration is idempotent — calling this hook in multiple components
 * or re-rendering will not duplicate data.
 *
 * Reports migration status for debugging/observability.
 */

import { useEffect, useRef, useState } from "react";
import { getDatabase } from "../db/client";
import { isMigrationComplete, migrateModerationToRxDB } from "../moderation/migration";

export type MigrationStatus = "idle" | "running" | "complete" | "skipped" | "error";

/**
 * Trigger moderation migration when ownerAccountId becomes available.
 *
 * @param ownerAccountId - The current user's account ID (null if not signed in)
 */
export function useModerationMigration(ownerAccountId: string | null): MigrationStatus {
  const [status, setStatus] = useState<MigrationStatus>("idle");
  const attemptedRef = useRef(false);

  useEffect(() => {
    // Don't migrate if no owner (not signed in)
    if (!ownerAccountId) {
      setStatus("idle");
      return;
    }

    // Don't re-attempt in the same component lifecycle
    if (attemptedRef.current) return;

    // Check if already complete (fast path — no async needed)
    if (isMigrationComplete(ownerAccountId)) {
      setStatus("complete");
      return;
    }

    attemptedRef.current = true;
    setStatus("running");

    let cancelled = false;

    (async () => {
      try {
        const db = await getDatabase();
        if (cancelled) return;

        const result = await migrateModerationToRxDB(db, ownerAccountId);
        if (cancelled) return;

        if (result === null) {
          setStatus("skipped");
        } else {
          setStatus("complete");
        }
      } catch (err) {
        if (cancelled) return;
        console.warn("[useModerationMigration] Migration failed:", err);
        setStatus("error");
      }
    })();

    return () => { cancelled = true; };
  }, [ownerAccountId]);

  return status;
}
