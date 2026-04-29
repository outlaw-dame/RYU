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
import { getAdaptiveAlpha } from './weights';
import { applyExploration } from './exploration';
import { applyFeedbackBoosts } from './feedback-ranking';
import { normalizeSearchQuery } from './query-normalize';
import type { SearchOptions } from './types';

export async function searchAll(query: string, options: SearchOptions = {}) {
  const normalizedQuery = normalizeSearchQuery(query);
  if (normalizedQuery.length < 2) return null;

  let intent = classifyQueryIntent(normalizedQuery);
  intent = await refineIntentWithLLM(normalizedQuery, intent);

  const adaptiveAlpha = getAdaptiveAlpha(intent.alpha, intent.intent);

  const lexical = await searchOrama(normalizedQuery, options.db);
  const semantic = await semanticSearchLocal(normalizedQuery, 20, options.db);

  const fused = fuseResults(lexical, semantic, adaptiveAlpha);

  const cleaned = dedupe(fused);

  const withContext = applyContextBoosts(cleaned, options.context);

  const withFeedback = applyFeedbackBoosts(normalizedQuery, withContext);

  const prefs = getSearchPreferences();

  const mergedPreferences = {
    ...intent.preferredTypes,
    ...prefs.preferredTypes
  };

  const reranked = rerankResults(withFeedback, {
    preferredTypes: mergedPreferences
  });

  const explored = applyExploration(reranked);

  const provider = getRerankerProvider();
  const finalResults = provider ? await provider.rerank(normalizedQuery, explored) : explored;

  return groupResults(attachExplanations(finalResults, { ...intent, alpha: adaptiveAlpha }, options.context));
}
