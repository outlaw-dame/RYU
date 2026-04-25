import { loadQwenRerankerRuntime } from './qwen-reranker-runtime';
import type { RankedSearchResult } from './types';

export type RerankerProvider = {
  id: string;
  rerank(query: string, docs: RankedSearchResult[]): Promise<RankedSearchResult[]>;
};

let activeProvider: RerankerProvider | null = null;
let qwenTokenizer: any = null;
let qwenModel: any = null;

export function registerRerankerProvider(provider: RerankerProvider) {
  activeProvider = provider;
}

export function clearRerankerProvider() {
  activeProvider = null;
}

export function getRerankerProvider(): RerankerProvider | null {
  return activeProvider;
}

function docText(doc: RankedSearchResult): string {
  return [doc.title, doc.authorText, doc.description, doc.enrichmentText]
    .filter(Boolean)
    .join(' ')
    .slice(0, 4096);
}

export function createJinaReranker(apiUrl: string): RerankerProvider {
  return {
    id: 'jina-reranker-m0',
    rerank: async (query, docs) => {
      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'jina-reranker-m0',
            query,
            documents: docs.map((d) => ({ text: docText(d) }))
          })
        });

        if (!response.ok) return docs;

        const json = await response.json();
        const scores = json.results ?? [];

        return docs
          .map((doc, i) => ({ ...doc, score: doc.score + (scores[i]?.relevance_score ?? 0) }))
          .sort((a, b) => b.score - a.score);
      } catch {
        return docs;
      }
    }
  };
}

async function getQwenRuntime() {
  if (!qwenTokenizer || !qwenModel) {
    const runtime = await loadQwenRerankerRuntime();
    qwenTokenizer = runtime.tokenizer;
    qwenModel = runtime.model;
  }

  return { tokenizer: qwenTokenizer, model: qwenModel };
}

function formatQwenPrompt(query: string, document: string): string {
  return [
    'Judge whether the Document is relevant to the Query for a book search app.',
    `<Query>: ${query.slice(0, 1024)}`,
    `<Document>: ${document.slice(0, 4096)}`,
    'Answer only yes or no.'
  ].join('\n');
}

async function scoreWithQwen(query: string, doc: RankedSearchResult): Promise<number> {
  const { tokenizer, model } = await getQwenRuntime();
  const prompt = formatQwenPrompt(query, docText(doc));
  const inputs = tokenizer(prompt, { truncation: true, max_length: 4096 });
  const output = await model(inputs);

  const logits = output?.logits?.data;
  if (!logits) return 0;

  const yesId = tokenizer.convert_tokens_to_ids?.('yes');
  const noId = tokenizer.convert_tokens_to_ids?.('no');
  if (typeof yesId !== 'number' || typeof noId !== 'number') return 0;

  const yes = Number(logits[yesId] ?? 0);
  const no = Number(logits[noId] ?? 0);
  const max = Math.max(yes, no);
  const yesExp = Math.exp(yes - max);
  const noExp = Math.exp(no - max);

  return yesExp / (yesExp + noExp);
}

export function createQwen3Reranker(): RerankerProvider {
  return {
    id: 'qwen3-reranker-0.6b',
    rerank: async (query, docs) => {
      try {
        const candidates = docs.slice(0, 12);
        const rest = docs.slice(12);

        const scored = await Promise.allSettled(
          candidates.map(async (doc) => {
            const relevance = await scoreWithQwen(query, doc);
            return {
              ...doc,
              score: doc.score + relevance * 5,
              reasons: [...(doc.reasons ?? []), 'qwen-rerank']
            };
          })
        );

        const reranked = scored.map((result, index) =>
          result.status === 'fulfilled' ? result.value : candidates[index]
        );

        return [...reranked.sort((a, b) => b.score - a.score), ...rest];
      } catch {
        return docs;
      }
    }
  };
}
