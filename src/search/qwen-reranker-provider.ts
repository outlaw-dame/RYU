import type { RerankerProvider } from './reranker-provider';
import type { RankedSearchResult } from './types';

type QwenTokenizer = {
  (prompt: string, options: { truncation: boolean; max_length: number }): unknown;
  convert_tokens_to_ids?: (token: string) => number | undefined;
};

type QwenModelOutput = {
  logits?: {
    data?: ArrayLike<number>;
  } | null;
};

type QwenModel = (inputs: unknown) => Promise<QwenModelOutput>;

let qwenTokenizer: QwenTokenizer | null = null;
let qwenModel: QwenModel | null = null;
let missingLogitsWarned = false;

function docText(doc: RankedSearchResult): string {
  return [doc.title, doc.authorText, doc.description, doc.enrichmentText]
    .filter(Boolean)
    .join(' ')
    .slice(0, 4096);
}

async function getQwenRuntime() {
  if (!qwenTokenizer || !qwenModel) {
    const { loadQwenRerankerRuntime } = await import('./qwen-reranker-runtime');
    const runtime = await loadQwenRerankerRuntime();
    if (typeof runtime.tokenizer !== 'function' || typeof runtime.model !== 'function') {
      throw new Error('Qwen runtime returned unexpected tokenizer/model types.');
    }

    qwenTokenizer = runtime.tokenizer as QwenTokenizer;
    qwenModel = runtime.model as QwenModel;
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
  if (!logits) {
    if (!missingLogitsWarned) {
      console.warn('Qwen reranker returned no logits; falling back to lexical score for this candidate set.');
      missingLogitsWarned = true;
    }
    return 0;
  }

  const yesId = tokenizer.convert_tokens_to_ids?.('yes');
  const noId = tokenizer.convert_tokens_to_ids?.('no');
  if (typeof yesId !== 'number' || typeof noId !== 'number') {
    return 0;
  }

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