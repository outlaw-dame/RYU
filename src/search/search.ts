import { searchOrama } from './orama';
import { groupResults } from './group';
import { dedupe } from './ranking';

export async function searchAll(query: string) {
  if (!query || query.length < 2) return null;

  const results = await searchOrama(query);

  const cleaned = dedupe(results);

  return groupResults(cleaned);
}
