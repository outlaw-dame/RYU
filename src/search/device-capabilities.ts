export type DeviceCapabilityTier = 'low' | 'standard' | 'enhanced';

type NavigatorWithDeviceMemory = Navigator & {
  deviceMemory?: number;
};

function getNavigator(): NavigatorWithDeviceMemory | null {
  if (typeof navigator === 'undefined') return null;
  return navigator as NavigatorWithDeviceMemory;
}

export function getDeviceCapabilityTier(): DeviceCapabilityTier {
  const nav = getNavigator();
  if (!nav) return 'standard';

  const deviceMemory = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : undefined;
  const cores = typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : undefined;

  if ((deviceMemory !== undefined && deviceMemory < 4) || (cores !== undefined && cores < 4)) {
    return 'low';
  }

  if ((deviceMemory !== undefined && deviceMemory >= 8) || (cores !== undefined && cores >= 8)) {
    return 'enhanced';
  }

  return 'standard';
}

export function canAttemptEmbeddingGemma(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof WebAssembly === 'undefined') return false;

  const tier = getDeviceCapabilityTier();
  return tier === 'standard' || tier === 'enhanced';
}

export function canAttemptMiniLM(): boolean {
  return typeof window !== 'undefined' && typeof WebAssembly !== 'undefined';
}
