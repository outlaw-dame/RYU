// NOTE: Metron API requires auth + no CORS
// This adapter is intentionally server/proxy-only

export async function searchMetron(title: string) {
  throw new Error('Metron integration requires server proxy (no CORS + API key required)');
}
