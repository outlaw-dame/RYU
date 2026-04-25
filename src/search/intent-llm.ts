import { isWebLLMReady, generateText } from '@/ai/webllm-runtime';
import { classifyQueryIntent, type QueryIntent } from './intent';

function safeParse(json: string): Partial<QueryIntent> | null {
  try {
    const parsed = JSON.parse(json);

    if (typeof parsed !== 'object' || !parsed) return null;

    return parsed;
  } catch {
    return null;
  }
}

export async function refineIntentWithLLM(query: string, base: QueryIntent): Promise<QueryIntent> {
  if (!isWebLLMReady()) return base;

  try {
    const prompt = `
Classify this search query for a book app.

Return JSON ONLY with fields:
intent (isbn|author|title|semantic|format|general)
alpha (0-1)

Query: "${query}"
`;

    const output = await generateText(prompt);

    if (!output) return base;

    const parsed = safeParse(output);
    if (!parsed) return base;

    const alpha = typeof parsed.alpha === 'number' && parsed.alpha >= 0 && parsed.alpha <= 1
      ? parsed.alpha
      : base.alpha;

    const intent = typeof parsed.intent === 'string'
      ? parsed.intent
      : base.intent;

    return {
      ...base,
      intent: intent as any,
      alpha,
      reasons: [...base.reasons, 'llm-refined']
    };
  } catch {
    return base;
  }
}
