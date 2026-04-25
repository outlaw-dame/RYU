import { searchOrama } from './orama';
import { groupResults } from './group';
import { dedupe, fuseResults } from './ranking';
import { semanticSearchLocal } from './vector-index';
import { rerankResults } from './rerank';
import { getSearchPreferences } from './preferences';
import { getRerankerProvider } from './reranker-provider';
import { classifyQueryIntent } from './intent';
import { refineIntentWithLLM } from './intent-llm';
import { applyContextBoosts } from './context-ranking';
import { attachExplanations } from './explain';
import type { SearchOptions } from './types';

export async function searchAll(query: string, options: SearchOptions = {}) {
  if (!query || query.length < 2) return null;

  let intent = classifyQueryIntent(query);
  intent = await refineIntentWithLLM(query, intent);

  const lexical = await searchOrama(query);
  const semantic = await semanticSearchLocal(query);

  const fused = fuseResults(lexical, semantic, intent.alpha);

  const cleaned = dedupe(fused);

  const withContext = applyContextBoosts(cleaned, options.context);

  const prefs = getSearchPreferences();

  const mergedPreferences = {
    ...intent.preferredTypes,
    ...prefs.preferredTypes
  };

  const reranked = rerankResults(withContext, {
    preferredTypes: mergedPreferences
  });

  const provider = getRerankerProvider();
  const finalResults = provider ? await provider.rerank(query, reranked) : reranked;

  return groupResults(attachExplanations(finalResults, intent, options.context));
}
