export type DeviceCapabilityTier = 'low' | 'standard' | 'enhanced';

export function getDeviceCapabilityTier(): DeviceCapabilityTier {
  if (typeof navigator === 'undefined') return 'standard';

  const deviceMemory = typeof navigator.deviceMemory === 'number' ? navigator.deviceMemory : undefined;
  const cores = typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : undefined;

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
