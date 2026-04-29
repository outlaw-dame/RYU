import { getDatabase } from '@/db/client';

const MAX_RESULTS = 8;

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function autocomplete(query: string) {
  const normalized = query.trim();
  if (!normalized || normalized.length < 2) return [];

  const db = await getDatabase();
  const safePrefix = escapeRegex(normalized);

  const results = await db.editions
    .find({ selector: { title: { $regex: `^${safePrefix}`, $options: 'i' } }, limit: MAX_RESULTS })
    .exec();

  return results.map((doc: any) => doc.toJSON());
}
