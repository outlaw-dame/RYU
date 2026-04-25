import baseline from './fixtures/search-baseline.json';
import { classifyQueryIntent } from '../src/search/intent';
import { rankLexical, dedupe, fuseResults } from '../src/search/ranking';
import { rerankResults } from '../src/search/rerank';
import { applyContextBoosts } from '../src/search/context-ranking';
import { applyFeedbackBoosts } from '../src/search/feedback-ranking';
import { recordClick, getBoostForDoc } from '../src/search/feedback';
import { getAdaptiveAlpha, resetAdaptiveWeights } from '../src/search/weights';
import { applyExploration } from '../src/search/exploration';
import { attachExplanations } from '../src/search/explain';
import { groupResults } from '../src/search/group';
import type { RankedSearchResult, SearchDocument } from '../src/search/types';

function installLocalStorageMock(): void {
  const store = new Map<string, string>();

  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
      clear: () => { store.clear(); }
    },
    configurable: true
  });
}

installLocalStorageMock();

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const docs: SearchDocument[] = [
  {
    id: 'edition:hp1',
    type: 'edition',
    title: "Harry Potter and the Sorcerer's Stone",
    description: 'A young wizard discovers magic and friendship.',
    authorText: 'J. K. Rowling',
    isbnText: '9780439708180',
    enrichmentText: 'fantasy magic school',
    source: 'local',
    updatedAt: new Date().toISOString()
  },
  {
    id: 'work:dune',
    type: 'work',
    title: 'Dune',
    description: 'A sweeping science fiction novel about ecology, empire, memory, and prophecy.',
    authorText: 'Frank Herbert',
    isbnText: '',
    enrichmentText: 'science fiction desert politics',
    source: 'local',
    updatedAt: '2022-01-01T00:00:00.000Z'
  },
  {
    id: 'author:butler',
    type: 'author',
    title: 'Octavia E. Butler',
    description: 'American science fiction author.',
    authorText: 'Octavia E. Butler',
    isbnText: '',
    enrichmentText: 'parable kindred science fiction',
    source: 'local',
    updatedAt: '2022-01-01T00:00:00.000Z'
  }
];

function testBaselineFixture(): void {
  for (const testCase of baseline.cases) {
    const intent = classifyQueryIntent(testCase.query);
    assert(intent.intent === testCase.expectedIntent, `Intent mismatch for ${testCase.query}`);

    const ranked = rankLexical(docs, testCase.query);

    if ('expectedTopId' in testCase) {
      assert(ranked[0]?.id === testCase.expectedTopId, `Top id mismatch for ${testCase.query}`);
    }

    if ('expectedTopType' in testCase) {
      assert(ranked[0]?.type === testCase.expectedTopType, `Top type mismatch for ${testCase.query}`);
    }

    if ('expectedReason' in testCase) {
      assert(ranked[0]?.reasons?.includes(testCase.expectedReason) === true, `Missing reason for ${testCase.query}`);
    }
  }
}

function testFusionAndDedupe(): RankedSearchResult[] {
  const ranked = rankLexical(docs, '9780439708180');
  const semantic: RankedSearchResult[] = [
    { ...ranked[0], semanticScore: 0.95, score: 0.95 },
    { ...ranked[0], semanticScore: 0.90, score: 0.90 }
  ];

  const fused = fuseResults(ranked, semantic, 0.5);
  const cleaned = dedupe(fused);
  assert(cleaned.filter((result) => result.id === ranked[0].id).length === 1, 'Dedupe should collapse duplicate ids');
  return cleaned;
}

function testContextAndRerank(): void {
  const ranked = rankLexical(docs, '9780439708180');
  const contexted = applyContextBoosts(ranked, { surface: 'library', preferOwnedLibrary: true });
  assert(contexted[0].score >= ranked[0].score, 'Context boosts should not reduce score');

  const reranked = rerankResults(contexted, { preferredTypes: { edition: 2 } });
  assert(reranked[0]?.type === 'edition', 'Edition preference should preserve/boost editions');
}

function testAdaptiveAlpha(): void {
  resetAdaptiveWeights();
  const base = getAdaptiveAlpha(0.75, 'semantic');
  assert(base === 0.75, 'Adaptive alpha should use base alpha before enough samples');

  recordClick('query-a', 'work:dune', 'semantic', 0.95);
  recordClick('query-b', 'work:dune', 'semantic', 1.2);
  assert(getAdaptiveAlpha(0.75, 'semantic') === 0.75, 'Adaptive alpha should not activate before 3 samples');

  recordClick('query-c', 'work:dune', 'semantic', 0.95);
  const learned = getAdaptiveAlpha(0.75, 'semantic');
  assert(learned <= 0.9 && learned >= 0.1, 'Adaptive alpha should remain clamped');
  assert(learned > 0.75, 'Adaptive alpha should move after enough high-alpha feedback');
}

function testFeedbackBoostUsesActualQuery(): void {
  const ranked = rankLexical(docs, 'dune');
  const target = ranked.find((result) => result.id === 'work:dune');
  assert(!!target, 'Dune work should be present in lexical results');

  recordClick('dune', 'work:dune', 'title', 0.3);
  assert(getBoostForDoc('library', 'work:dune') === 0, 'Feedback boost should not use UI surface as query key');
  assert(getBoostForDoc('dune', 'work:dune') > 0, 'Feedback boost should use actual query key');

  const boosted = applyFeedbackBoosts('dune', ranked);
  const boostedTarget = boosted.find((result) => result.id === 'work:dune');
  assert(boostedTarget?.reasons?.includes('feedback-boost') === true, 'Feedback boost should add reason');
}

function testExplorationGuardrails(): void {
  const ranked = rankLexical(docs, 'dune');
  const none = applyExploration(ranked, 0);
  assert(none.length === ranked.length, 'Exploration should never change result count');
  assert(none[0]?.id === ranked[0]?.id, 'Zero exploration should preserve ordering');

  const explored = applyExploration(ranked, 1);
  assert(explored.length === ranked.length, 'Exploration should preserve result count');
  assert(explored.slice(0, Math.min(5, explored.length)).every((result) => result.reasons?.includes('exploration')), 'Explored head should be explainable');
}

function testExplanationAndGrouping(): void {
  const ranked = rankLexical(docs, '9780439708180');
  const intent = classifyQueryIntent('9780439708180');
  const explained = attachExplanations(ranked, intent, { surface: 'global' });
  const grouped = groupResults(explained);

  assert(grouped.all[0]?.explanation?.intent.intent === 'isbn', 'Grouped results should preserve explanations');
  assert(grouped.editions[0]?.explanation?.stages.fused === grouped.editions[0]?.score, 'Explanation should preserve fused score');
}

function main(): void {
  testBaselineFixture();
  testFusionAndDedupe();
  testContextAndRerank();
  testAdaptiveAlpha();
  testFeedbackBoostUsesActualQuery();
  testExplorationGuardrails();
  testExplanationAndGrouping();
  console.log('Search evaluation guardrails passed.');
}

main();
