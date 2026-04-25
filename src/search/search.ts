import { searchOrama } from './orama';
import { groupResults } from './group';
import { dedupe, fuseResults } from './ranking';
import { semanticSearchLocal } from './vector-index';
import { rerankResults } from './rerank';
import { getSearchPreferences } from './preferences';
import { getRerankerProvider } from './reranker-provider';

export async function searchAll(query: string) {
  if (!query || query.length < 2) return null;

  const lexical = await searchOrama(query);
  const semantic = await semanticSearchLocal(query);

  const fused = fuseResults(lexical, semantic);

  const cleaned = dedupe(fused);

  const prefs = getSearchPreferences();
  const reranked = rerankResults(cleaned, { preferredTypes: prefs.preferredTypes });

  const provider = getRerankerProvider();
  const finalResults = provider ? await provider.rerank(query, reranked) : reranked;

  return groupResults(finalResults);
}
