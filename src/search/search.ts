import { searchOrama } from './orama';
import { groupResults } from './group';
import { dedupe, fuseResults } from './ranking';
import { semanticSearchLocal } from './vector-index';
import { rerankResults } from './rerank';
import { getSearchPreferences } from './preferences';
import { getRerankerProvider } from './reranker-provider';
import { classifyQueryIntent } from './intent';

export async function searchAll(query: string) {
  if (!query || query.length < 2) return null;

  const intent = classifyQueryIntent(query);

  const lexical = await searchOrama(query);
  const semantic = await semanticSearchLocal(query);

  const fused = fuseResults(lexical, semantic, intent.alpha);

  const cleaned = dedupe(fused);

  const prefs = getSearchPreferences();

  const mergedPreferences = {
    ...intent.preferredTypes,
    ...prefs.preferredTypes
  };

  const reranked = rerankResults(cleaned, {
    preferredTypes: mergedPreferences
  });

  const provider = getRerankerProvider();
  const finalResults = provider ? await provider.rerank(query, reranked) : reranked;

  return groupResults(finalResults);
}
