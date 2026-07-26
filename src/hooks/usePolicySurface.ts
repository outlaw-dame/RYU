/**
 * usePolicySurface — provides moderation policy evaluation for rendering surfaces.
 *
 * Builds PolicyStoreState from the current useModeration data and provides
 * a `filterItems()` function that surfaces can use to filter/collapse content.
 *
 * Usage:
 * ```tsx
 * const { filterItems } = usePolicySurface("home");
 * const visible = filterItems(timelineStatuses);
 * // visible[i].hidden → should not render
 * // visible[i].decision.action → "show" | "hide" | "warn" | "blur" | "collapse"
 * ```
 */

import { useCallback, useMemo } from "react";
import { useModeration } from "./useModeration";
import type { PolicyEvaluationContext } from "../moderation/policy-types";
import type { PolicyAccount, PolicyDomain, PolicyFilter } from "../moderation/policy-types";
import type { PolicyStoreState } from "../moderation/policy-engine";
import {
  applyPolicyToSurface,
  type ModeratableStatus,
  type PolicySurfaceResult
} from "../moderation/policy-surface-adapter";

export type PolicySurface = PolicyEvaluationContext["surface"];

/**
 * Hook providing moderation evaluation for a specific surface.
 *
 * @param surface - The rendering surface context (home, notifications, public, etc.)
 */
export function usePolicySurface(surface: PolicySurface) {
  const moderation = useModeration();

  // Build PolicyStoreState from current moderation data.
  // This maps the localStorage-based stores into the shape the policy engine expects.
  const policyState: PolicyStoreState = useMemo(() => {
    const accounts: PolicyAccount[] = [
      ...moderation.muteList.map((entry): PolicyAccount => ({
        id: `local:mute:${entry.accountId}`,
        accountId: entry.accountId,
        acct: entry.acct,
        action: "mute",
        hideNotifications: entry.hideNotifications ?? true,
        expiresAt: entry.expiresAt ?? null,
        source: "local",
        createdAt: entry.createdAt,
        updatedAt: entry.createdAt
      })),
      ...moderation.blockList.map((entry): PolicyAccount => ({
        id: `local:block:${entry.accountId}`,
        accountId: entry.accountId,
        acct: entry.acct,
        action: "block",
        hideNotifications: true,
        expiresAt: null,
        source: "local",
        createdAt: entry.createdAt,
        updatedAt: entry.createdAt
      }))
    ];

    const domains: PolicyDomain[] = moderation.domainBlockList.map((entry): PolicyDomain => ({
      id: `local:domain:${entry.domain}`,
      domain: entry.domain,
      severity: "block",
      reason: entry.reason,
      source: "local",
      createdAt: entry.createdAt,
      updatedAt: entry.createdAt
    }));

    const filters: PolicyFilter[] = moderation.contentFilters.map((entry): PolicyFilter => ({
      id: entry.id,
      title: entry.phrase,
      keywords: [{ id: `kw-${entry.id}`, keyword: entry.phrase, wholeWord: entry.wholeWord }],
      contexts: ["home", "notifications", "public", "thread", "account"],
      action: entry.action,
      expiresAt: entry.expiresAt ?? null,
      source: "local",
      createdAt: entry.createdAt,
      updatedAt: entry.createdAt
    }));

    return { accounts, domains, filters, relationships: [] };
  }, [moderation.muteList, moderation.blockList, moderation.domainBlockList, moderation.contentFilters]);

  const context: PolicyEvaluationContext = useMemo(() => ({ surface }), [surface]);

  /**
   * Filter a list of status-like items through the moderation policy.
   * Returns results with `hidden` flag and `decision` for each item.
   */
  const filterItems = useCallback(
    <T extends ModeratableStatus>(items: readonly T[]): PolicySurfaceResult<T>[] => {
      if (items.length === 0) return [];
      return applyPolicyToSurface(items, policyState, context);
    },
    [policyState, context]
  );

  /**
   * Check a single item against moderation policy.
   */
  const checkItem = useCallback(
    <T extends ModeratableStatus>(item: T): PolicySurfaceResult<T> => {
      return applyPolicyToSurface([item], policyState, context)[0];
    },
    [policyState, context]
  );

  return { filterItems, checkItem, policyState };
}
