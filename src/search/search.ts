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
import { buildSearchQueryExpansionPlan } from './query-expansion';
import type { SearchOptions } from './types';

export async function searchAll(query: string, options: SearchOptions = {}) {
  const normalizedQuery = normalizeSearchQuery(query);
  if (normalizedQuery.length < 2) return null;

  const expansion = await buildSearchQueryExpansionPlan(normalizedQuery, options.db);
  if (expansion.normalizedQuery.length < 2) return null;

  const primaryQuery = expansion.normalizedQuery;
  const lexicalQuery = expansion.lexicalQuery || primaryQuery;
  const semanticQuery = expansion.semanticQuery || primaryQuery;

  let intent = classifyQueryIntent(primaryQuery);
  intent = await refineIntentWithLLM(primaryQuery, intent);

  const adaptiveAlpha = getAdaptiveAlpha(intent.alpha, intent.intent);

  const lexical = await searchOrama(lexicalQuery, options.db);
  const semantic = await semanticSearchLocal(semanticQuery, 20, options.db);

  const fused = fuseResults(lexical, semantic, adaptiveAlpha);

  const cleaned = dedupe(fused);

  const withContext = applyContextBoosts(cleaned, options.context);

  const withFeedback = applyFeedbackBoosts(primaryQuery, withContext);

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
  const finalResults = provider ? await provider.rerank(primaryQuery, explored) : explored;

  return groupResults(attachExplanations(finalResults, { ...intent, alpha: adaptiveAlpha }, options.context));
}
