import baseline from './fixtures/search-baseline.json';
import { classifyQueryIntent } from '../src/search/intent';
import { rankLexical, dedupe, fuseResults } from '../src/search/ranking';
import { rerankResults } from '../src/search/rerank';
import { applyContextBoosts } from '../src/search/context-ranking';
import type { RankedSearchResult, SearchDocument } from '../src/search/types';

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

function testFusionAndDedupe(): void {
  const ranked = rankLexical(docs, '9780439708180');
  const semantic: RankedSearchResult[] = [
    { ...ranked[0], semanticScore: 0.95, score: 0.95 },
    { ...ranked[0], semanticScore: 0.90, score: 0.90 }
  ];

  const fused = fuseResults(ranked, semantic, 0.5);
  const cleaned = dedupe(fused);
  assert(cleaned.filter((result) => result.id === ranked[0].id).length === 1, 'Dedupe should collapse duplicate ids');
}

function testContextAndRerank(): void {
  const ranked = rankLexical(docs, '9780439708180');
  const contexted = applyContextBoosts(ranked, { surface: 'library', preferOwnedLibrary: true });
  assert(contexted[0].score >= ranked[0].score, 'Context boosts should not reduce score');

  const reranked = rerankResults(contexted, { preferredTypes: { edition: 2 } });
  assert(reranked[0]?.type === 'edition', 'Edition preference should preserve/boost editions');
}

function main(): void {
  testBaselineFixture();
  testFusionAndDedupe();
  testContextAndRerank();
  console.log('Search evaluation guardrails passed.');
}

main();
