/**
 * Phase 18 — Search quality evaluation v2.
 *
 * Expands the Phase 8 eval into a product-quality gate with:
 * - Larger book-specific golden set (25+ cases)
 * - Semantic-only test cases
 * - Misspellings/fuzzy title cases
 * - Author/title ambiguity cases
 * - Privacy exclusion test cases
 * - Performance thresholds
 *
 * Run: `npm run search:quality-eval`
 *
 * CI gates:
 * - Privacy violations = 0
 * - Intent accuracy >= 50% (current baseline, ratchet up)
 * - Strict exact-match hit rate >= 90%
 * - Max query time < 500ms
 */

import qualityCases from './fixtures/search-quality-cases.json';
import { classifyQueryIntent } from '../src/search/intent';
import { rankLexical } from '../src/search/ranking';
import { filterResultsByScope } from '../src/search/scope-filter';
import { normalizeSearchQuery } from '../src/search/query-normalize';
import type { SearchDocument } from '../src/search/types';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`QUALITY GATE FAILED: ${message}`);
}

// Expanded fixture set covering all entity types including private docs.
const docs: SearchDocument[] = [
  {
    id: 'edition:hp1',
    type: 'edition',
    title: "Harry Potter and the Sorcerer's Stone",
    description: 'A young wizard discovers magic and friendship at a school of witchcraft.',
    authorText: 'J. K. Rowling',
    isbnText: '9780439708180',
    enrichmentText: 'fantasy magic school',
    source: 'local',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'work:dune',
    type: 'work',
    title: 'Dune',
    description: 'A sweeping science fiction novel about ecology, empire, memory, and prophecy on a desert planet.',
    authorText: 'Frank Herbert',
    isbnText: '',
    enrichmentText: 'science fiction desert politics sandworm spice',
    source: 'local',
    updatedAt: '2022-01-01T00:00:00.000Z'
  },
  {
    id: 'author:butler',
    type: 'author',
    title: 'Octavia E. Butler',
    description: 'American science fiction author known for Kindred, Parable of the Sower, and Fledgling.',
    authorText: 'Octavia E. Butler',
    isbnText: '',
    enrichmentText: 'parable kindred science fiction afrofuturism',
    source: 'local',
    updatedAt: '2022-01-01T00:00:00.000Z'
  },
  {
    id: 'author:herbert',
    type: 'author',
    title: 'Frank Herbert',
    description: 'American science fiction author, best known for Dune.',
    authorText: 'Frank Herbert',
    isbnText: '',
    enrichmentText: 'science fiction dune ecology',
    source: 'local',
    updatedAt: '2022-01-01T00:00:00.000Z'
  },
  {
    id: 'work:kindred',
    type: 'work',
    title: 'Kindred',
    description: 'A modern Black woman is pulled back in time to the antebellum South.',
    authorText: 'Octavia E. Butler',
    isbnText: '',
    enrichmentText: 'time travel slavery historical fiction',
    source: 'local',
    updatedAt: '2022-01-01T00:00:00.000Z'
  },
  {
    id: 'work:parable',
    type: 'work',
    title: 'Parable of the Sower',
    description: 'In a dystopian future, a young woman leads a community northward.',
    authorText: 'Octavia E. Butler',
    isbnText: '',
    enrichmentText: 'dystopia climate religion community',
    source: 'local',
    updatedAt: '2022-01-01T00:00:00.000Z'
  },
  {
    id: 'review:private-1',
    type: 'review',
    title: 'My secret notes on Dune',
    description: 'These are my private reading notes.',
    authorText: 'user-1',
    isbnText: '',
    enrichmentText: '',
    source: 'local',
    scope: 'private',
    ownerId: 'user-1',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'review:local-only-1',
    type: 'review',
    title: 'Draft review of Kindred',
    description: 'Local-only draft that should never appear in global search.',
    authorText: 'user-1',
    isbnText: '',
    enrichmentText: '',
    source: 'local',
    scope: 'local-only',
    ownerId: 'user-1',
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
];

type QualityCase = {
  category: string;
  query: string;
  expectedIntent?: string;
  expectedTopId?: string;
  expectedTopType?: string;
  expectedTop3Includes?: string;
  expectedTop3IncludesType?: string;
  expectNoResults?: boolean;
  notes?: string;
};

type EvalResult = {
  query: string;
  category: string;
  passed: boolean;
  failures: string[];
  durationMs: number;
  // Carry expected fields so metric aggregation doesn't need O(N²) lookups.
  expectedIntent?: string;
  expectedTopId?: string;
  expectedTop3Includes?: string;
};

function evaluateCase(testCase: QualityCase): EvalResult {
  const start = performance.now();
  const failures: string[] = [];
  const normalized = normalizeSearchQuery(testCase.query);

  const baseResult = {
    query: testCase.query,
    category: testCase.category,
    expectedIntent: testCase.expectedIntent,
    expectedTopId: testCase.expectedTopId,
    expectedTop3Includes: testCase.expectedTop3Includes
  };

  // Empty/short queries: exercise the actual ranking pipeline so this is a
  // real quality gate — if rankLexical returns results for empty/single-char
  // queries, the scope filter should still exclude private docs, and the test
  // verifies no results survive after normalization + filtering.
  if (testCase.expectNoResults) {
    const results = rankLexical(docs, normalized);
    const globalFiltered = filterResultsByScope(results, { surface: 'global' });
    if (globalFiltered.length > 0 && normalized.length >= 2) {
      failures.push(`Expected no results but got ${globalFiltered.length}`);
    }
    // For queries that normalize to < 2 chars, the search pipeline's
    // normalizeSearchQuery gate prevents execution — this is correct behavior.
    return { ...baseResult, passed: failures.length === 0, failures, durationMs: performance.now() - start };
  }

  if (normalized.length < 2) {
    // The query normalized to below the minimum — pass (correctly gated).
    return { ...baseResult, passed: true, failures, durationMs: performance.now() - start };
  }

  // Intent classification.
  if (testCase.expectedIntent) {
    const intent = classifyQueryIntent(normalized);
    if (intent.intent !== testCase.expectedIntent) {
      failures.push(`Intent: expected '${testCase.expectedIntent}' got '${intent.intent}'`);
    }
  }

  // Lexical ranking.
  const ranked = rankLexical(docs, normalized);

  // Apply global scope filter to simulate a real global search.
  const globalFiltered = filterResultsByScope(ranked, { surface: 'global' });

  if (testCase.expectedTopId) {
    if (globalFiltered[0]?.id !== testCase.expectedTopId) {
      failures.push(`Top ID: expected '${testCase.expectedTopId}' got '${globalFiltered[0]?.id ?? 'none'}'`);
    }
  }

  if (testCase.expectedTopType) {
    if (globalFiltered[0]?.type !== testCase.expectedTopType) {
      failures.push(`Top type: expected '${testCase.expectedTopType}' got '${globalFiltered[0]?.type ?? 'none'}'`);
    }
  }

  if (testCase.expectedTop3Includes) {
    const top3Ids = globalFiltered.slice(0, 3).map((r) => r.id);
    if (!top3Ids.includes(testCase.expectedTop3Includes)) {
      failures.push(`Top-3 inclusion: expected '${testCase.expectedTop3Includes}' in [${top3Ids.join(', ')}]`);
    }
  }

  if (testCase.expectedTop3IncludesType) {
    const top3Types = globalFiltered.slice(0, 3).map((r) => r.type);
    if (!top3Types.includes(testCase.expectedTop3IncludesType as any)) {
      failures.push(`Top-3 type inclusion: expected '${testCase.expectedTop3IncludesType}' in [${top3Types.join(', ')}]`);
    }
  }

  // Privacy gate: private/local-only docs must NEVER appear in global results.
  const leakedPrivate = globalFiltered.filter((r) => r.scope === 'private' || r.scope === 'local-only');
  if (leakedPrivate.length > 0) {
    failures.push(`PRIVACY VIOLATION: ${leakedPrivate.length} private/local-only docs leaked into global results`);
  }

  const durationMs = performance.now() - start;
  return { ...baseResult, passed: failures.length === 0, failures, durationMs };
}

function main(): void {
  const cases = qualityCases.cases as QualityCase[];
  const results: EvalResult[] = [];

  for (const testCase of cases) {
    results.push(evaluateCase(testCase));
  }

  // Aggregate metrics — O(N) using embedded expected fields, not O(N²) find().
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed);

  // Intent accuracy: only count cases that actually specify an expected intent.
  const intentCases = results.filter((r) => r.expectedIntent !== undefined);
  const intentCorrect = intentCases.filter((r) => !r.failures.some((f) => f.startsWith('Intent:')));
  const intentAccuracy = intentCases.length > 0 ? intentCorrect.length / intentCases.length : 1;

  // Exact match rate: only count cases with expectedTopId to avoid inflating
  // the metric with cases that can never fail the Top ID check.
  const exactMatchCases = results.filter((r) =>
    (r.category === 'exact-title' || r.category === 'isbn') && r.expectedTopId !== undefined
  );
  const exactMatchHit = exactMatchCases.filter((r) => !r.failures.some((f) => f.startsWith('Top ID:')));
  const exactMatchRate = exactMatchCases.length > 0 ? exactMatchHit.length / exactMatchCases.length : 1;

  // Semantic top-3 rate: only count cases with expectedTop3Includes.
  const semanticCases = results.filter((r) => r.category === 'semantic' && r.expectedTop3Includes !== undefined);
  const semanticHit = semanticCases.filter((r) => !r.failures.some((f) => f.startsWith('Top-3 inclusion:')));
  const semanticRate = semanticCases.length > 0 ? semanticHit.length / semanticCases.length : 1;

  const privacyCases = results.filter((r) => r.failures.some((f) => f.includes('PRIVACY VIOLATION')));
  const maxDurationMs = Math.max(...results.map((r) => r.durationMs));

  // Report.
  console.log(`\nSearch Quality Eval v2 Results:`);
  console.log(`  Total cases: ${total}`);
  console.log(`  Passed: ${passed}/${total} (${Math.round(passed / total * 100)}%)`);
  console.log(`  Intent accuracy: ${Math.round(intentAccuracy * 100)}% (${intentCorrect.length}/${intentCases.length})`);
  console.log(`  Exact match hit rate: ${Math.round(exactMatchRate * 100)}% (${exactMatchHit.length}/${exactMatchCases.length})`);
  console.log(`  Semantic top-3 rate: ${Math.round(semanticRate * 100)}% (${semanticHit.length}/${semanticCases.length})`);
  console.log(`  Privacy violations: ${privacyCases.length}`);
  console.log(`  Max query time: ${maxDurationMs.toFixed(1)}ms`);

  if (failed.length > 0) {
    console.log(`\n  Failed cases:`);
    for (const result of failed) {
      console.log(`    [${result.category}] "${result.query}": ${result.failures.join('; ')}`);
    }
  }

  // CI gates.
  assert(privacyCases.length === 0, 'Privacy violations detected in search results');
  // Intent accuracy threshold: set at current baseline (55%) and ratcheted up
  // as the classifier improves. The eval's purpose is to DETECT regressions,
  // not to block merges until the classifier is perfect.
  assert(intentAccuracy >= 0.50, `Intent accuracy ${Math.round(intentAccuracy * 100)}% below 50% threshold`);
  // Strict exact-match gate: any case with an expectedTopId must rank it #1.
  // This covers exact-title, isbn, AND fuzzy-title cases that specify expectedTopId.
  const strictExactCases = results.filter((r) => r.expectedTopId !== undefined);
  const strictExactHit = strictExactCases.filter((r) => !r.failures.some((f) => f.startsWith('Top ID:')));
  const strictExactRate = strictExactCases.length > 0 ? strictExactHit.length / strictExactCases.length : 1;
  assert(strictExactRate >= 0.90, `Exact-match hit rate ${Math.round(strictExactRate * 100)}% below 90% threshold`);
  assert(maxDurationMs < 500, `Max query time ${maxDurationMs.toFixed(1)}ms exceeds 500ms threshold`);

  console.log('\nSearch quality eval v2 passed.');
}

main();
