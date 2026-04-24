import { getDatabase } from '@/db/client';

const MAX_RESULTS = 8;

export async function autocomplete(query: string) {
  if (!query || query.length < 2) return [];

  const db = await getDatabase();

  const results = await db.editions
    .find({ selector: { title: { $regex: `^${query}`, $options: 'i' } }, limit: MAX_RESULTS })
    .exec();

  return results.map((doc: any) => doc.toJSON());
}
