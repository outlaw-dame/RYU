/**
 * Phase 40 -- Native packaging types.
 *
 * Defines the structured types for comparing PWA vs Capacitor
 * packaging options across platforms.
 */

/** Available packaging strategies. */
export type PackagingOption = 'pwa' | 'capacitor';

/** Support level for a capability on a given platform. */
export type SupportLevel = 'full' | 'partial' | 'none' | 'polyfill';

/** Target platforms for capability evaluation. */
export type TargetPlatform = 'ios-safari' | 'android-chrome' | 'desktop';

/** A single capability and its support status across platforms. */
export interface PlatformSupport {
  /** Target platform being evaluated. */
  platform: TargetPlatform;
  /** Level of support on this platform. */
  support: SupportLevel;
  /** Additional notes about the support status. */
  notes?: string;
  /** Minimum OS/browser version required (if applicable). */
  minVersion?: string;
}

/** Comparison of a single capability between PWA and Capacitor. */
export interface CapabilityComparison {
  /** Unique identifier for the capability. */
  id: string;
  /** Human-readable name of the capability. */
  name: string;
  /** Description of what this capability enables. */
  description: string;
  /** Importance for RYU's use case. */
  importance: 'critical' | 'high' | 'medium' | 'low';
  /** Support matrix when using PWA distribution. */
  pwaSupport: PlatformSupport[];
  /** Support matrix when using Capacitor packaging. */
  capacitorSupport: PlatformSupport[];
}

/** Summary of the packaging decision outcome. */
export interface PackagingDecision {
  /** The chosen packaging option for the current phase. */
  chosen: PackagingOption;
  /** Reason for the decision. */
  rationale: string;
  /** Whether a future re-evaluation is planned. */
  deferredEvaluation: boolean;
  /** Conditions that would trigger re-evaluation. */
  revisitConditions: string[];
}
