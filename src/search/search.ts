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
import { filterResultsByScope } from './scope-filter';
import { attachExplanations } from './explain';
import { getAdaptiveAlpha } from './weights';
import { applyExploration } from './exploration';
import { applyFeedbackBoosts } from './feedback-ranking';
import { normalizeSearchQuery } from './query-normalize';
import { buildSearchQueryExpansionPlan } from './query-expansion';
import type { SearchOptions } from './types';

export type SearchAllDiagnostics = {
  lexicalCount: number;
  semanticCount: number;
  fusedCount: number;
  finalCount: number;
  usedSemantic: boolean;
};

export type SearchAllResult = {
  grouped: ReturnType<typeof groupResults> | null;
  diagnostics: SearchAllDiagnostics;
};

export async function searchAll(query: string, options: SearchOptions = {}) {
  const result = await searchAllWithDiagnostics(query, options);
  return result.grouped;
}

export async function searchAllWithDiagnostics(query: string, options: SearchOptions = {}): Promise<SearchAllResult> {
  const normalizedQuery = normalizeSearchQuery(query);
  if (normalizedQuery.length < 2) return { grouped: null, diagnostics: { lexicalCount: 0, semanticCount: 0, fusedCount: 0, finalCount: 0, usedSemantic: false } };

  const expansion = await buildSearchQueryExpansionPlan(normalizedQuery, options.db);
  if (expansion.normalizedQuery.length < 2) return { grouped: null, diagnostics: { lexicalCount: 0, semanticCount: 0, fusedCount: 0, finalCount: 0, usedSemantic: false } };

  const primaryQuery = expansion.normalizedQuery;
  const semanticQuery = expansion.semanticQuery || primaryQuery;

  let intent = classifyQueryIntent(primaryQuery);
  intent = await refineIntentWithLLM(primaryQuery, intent);

  const adaptiveAlpha = getAdaptiveAlpha(intent.alpha, intent.intent);

  const lexical = await searchOrama(primaryQuery, options.db);
  const semantic = await semanticSearchLocal(semanticQuery, 20, options.db).catch(() => [] as import('./types').RankedSearchResult[]);

  // PRIVACY: Apply scope filter to each pre-fusion bucket BEFORE computing diagnostic
  // counts so that lexical/semantic/fused counts cannot reveal hidden-document hits
  // (side-channel metadata leakage of private/local-only matches on global surface).
  const lexicalScoped = filterResultsByScope(lexical, options.context);
  const semanticScoped = filterResultsByScope(semantic, options.context);

  const fused = fuseResults(lexicalScoped, semanticScoped, adaptiveAlpha);

  const cleaned = dedupe(fused);

  // Defense-in-depth: re-run the scope filter after fusion in case any
  // downstream pipeline reintroduces a hidden document.
  const scopeFiltered = filterResultsByScope(cleaned, options.context);

  const withContext = applyContextBoosts(scopeFiltered, options.context);

  const withFeedback = applyFeedbackBoosts(primaryQuery, withContext, options.context?.surface);

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

  const grouped = groupResults(attachExplanations(finalResults, { ...intent, alpha: adaptiveAlpha }, options.context));

  return {
    grouped,
    diagnostics: {
      lexicalCount: lexicalScoped.length,
      semanticCount: semanticScoped.length,
      fusedCount: fused.length,
      finalCount: grouped.all.length,
      usedSemantic: semanticScoped.length > 0
    }
  };
}
