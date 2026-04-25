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

function testIntentClassifier(): void {
  assert(classifyQueryIntent('9780439708180').intent === 'isbn', 'ISBN query should classify as isbn');
  assert(classifyQueryIntent('books by Octavia Butler').intent === 'author', 'Author query should classify as author');
  assert(classifyQueryIntent('books about grief and memory').intent === 'semantic', 'Thematic query should classify as semantic');
  assert(classifyQueryIntent('harry potter audiobook').intent === 'format', 'Format query should classify as format');
}

function testLexicalRanking(): RankedSearchResult[] {
  const ranked = rankLexical(docs, '9780439708180');
  assert(ranked[0]?.id === 'edition:hp1', 'ISBN match should rank the matching edition first');
  assert(ranked[0]?.reasons?.includes('isbn') === true, 'ISBN match should explain isbn reason');
  return ranked;
}

function testFusionAndDedupe(ranked: RankedSearchResult[]): void {
  const semantic: RankedSearchResult[] = [
    { ...ranked[0], semanticScore: 0.95, score: 0.95 },
    { ...ranked[0], semanticScore: 0.90, score: 0.90 }
  ];

  const fused = fuseResults(ranked, semantic, 0.5);
  const cleaned = dedupe(fused);
  assert(cleaned.filter((result) => result.id === ranked[0].id).length === 1, 'Dedupe should collapse duplicate ids');
}

function testContextAndRerank(ranked: RankedSearchResult[]): void {
  const contexted = applyContextBoosts(ranked, { surface: 'library', preferOwnedLibrary: true });
  assert(contexted[0].score >= ranked[0].score, 'Context boosts should not reduce score');

  const reranked = rerankResults(contexted, { preferredTypes: { edition: 2 } });
  assert(reranked[0]?.type === 'edition', 'Edition preference should preserve/boost editions');
}

function main(): void {
  testIntentClassifier();
  const ranked = testLexicalRanking();
  testFusionAndDedupe(ranked);
  testContextAndRerank(ranked);
  console.log('Search evaluation guardrails passed.');
}

main();
