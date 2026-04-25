import { searchOrama } from './orama';
import { groupResults } from './group';
import { dedupe, fuseResults } from './ranking';
import { semanticSearchLocal } from './vector-index';

export async function searchAll(query: string) {
  if (!query || query.length < 2) return null;

  const lexical = await searchOrama(query);
  const semantic = await semanticSearchLocal(query);

  const fused = fuseResults(lexical, semantic);

  const cleaned = dedupe(fused);

  return groupResults(cleaned);
}
