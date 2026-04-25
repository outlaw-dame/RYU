let litertReady = false;

export async function initializeLiteRT(basePath: string): Promise<boolean> {
  try {
    const { loadLiteRt } = await import('@litertjs/core');

    await loadLiteRt(basePath);

    litertReady = true;
    return true;
  } catch (err) {
    console.warn('LiteRT init failed', err);
    litertReady = false;
    return false;
  }
}

export function isLiteRTReady(): boolean {
  return litertReady;
}
