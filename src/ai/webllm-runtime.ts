let engine: any = null;

export async function initializeWebLLM(model: string): Promise<boolean> {
  try {
    const { CreateMLCEngine } = await import('@mlc-ai/web-llm');

    engine = await CreateMLCEngine(model);

    return true;
  } catch (err) {
    console.warn('WebLLM init failed', err);
    engine = null;
    return false;
  }
}

export async function generateText(prompt: string): Promise<string | null> {
  if (!engine) return null;

  try {
    const result = await engine.chat.completions.create({
      messages: [{ role: 'user', content: prompt }]
    });

    return result?.choices?.[0]?.message?.content ?? null;
  } catch (err) {
    console.warn('WebLLM generation failed', err);
    return null;
  }
}

export function isWebLLMReady(): boolean {
  return !!engine;
}
