/**
 * Surface-specific search configuration.
 *
 * Each search surface in the app has different visibility rules,
 * entity type preferences, and behavior. This module defines the
 * configuration for each surface so the app layer doesn't need to
 * manually construct SearchContext for every search call.
 *
 * Surfaces:
 *   global   — public/cache-safe only, all entity types
 *   library  — owned/private/local allowed, book-focused
 *   shelf    — shelf-scoped, owned content
 *   entity   — related work/author/edition context
 *   activity — remote cache visibility-aware
 */

import type { SearchContext, SearchSurface } from "./types";

export type SurfaceSearchConfig = {
  surface: SearchSurface;
  /** Default entity type hint (optional). */
  entityTypeHint?: SearchContext["entityTypeHint"];
  /** Whether to prefer the user's owned library in ranking. */
  preferOwnedLibrary: boolean;
  /** Description for debug/logging. */
  description: string;
};

/**
 * Pre-built surface configurations. Use these when calling search hooks
 * to ensure correct privacy and ranking behavior per surface.
 */
export const SURFACE_CONFIGS: Record<SearchSurface, SurfaceSearchConfig> = {
  global: {
    surface: "global",
    preferOwnedLibrary: false,
    description: "Global/explore search — public content only, no private leakage"
  },
  library: {
    surface: "library",
    preferOwnedLibrary: true,
    description: "User's library — includes private/local-only owned content"
  },
  shelf: {
    surface: "shelf",
    preferOwnedLibrary: true,
    description: "Shelf-scoped search — owned shelf content"
  },
  onboarding: {
    surface: "onboarding",
    preferOwnedLibrary: false,
    description: "Onboarding/discovery — public content for new users"
  },
  entity: {
    surface: "entity",
    preferOwnedLibrary: false,
    description: "Entity page related search — related works/authors/editions"
  }
};

/**
 * Build a SearchContext for a specific surface and user.
 * This is the primary way app code should construct search context.
 */
export function buildSearchContext(
  surface: SearchSurface,
  options?: {
    currentUserId?: string;
    activeShelfId?: string;
    entityTypeHint?: SearchContext["entityTypeHint"];
  }
): SearchContext {
  const config = SURFACE_CONFIGS[surface];

  return {
    surface: config.surface,
    preferOwnedLibrary: config.preferOwnedLibrary,
    entityTypeHint: options?.entityTypeHint ?? config.entityTypeHint,
    activeShelfId: options?.activeShelfId,
    currentUserId: options?.currentUserId
  };
}

/**
 * Build a SearchContext for the activity/social surface.
 * Activity search may include cached remote content with visibility rules.
 */
export function buildActivitySearchContext(
  currentUserId?: string
): SearchContext {
  return {
    surface: "global",
    preferOwnedLibrary: false,
    currentUserId
  };
}
