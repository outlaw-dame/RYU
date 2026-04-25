export async function loadQwenRerankerRuntime() {
  const transformers = (await import('@huggingface/transformers')) as any;
  const tokenizerCtor = transformers.AutoTokenizer;
  const modelCtor = transformers.AutoModelForCausalLM ?? transformers.AutoModelForSequenceClassification;

  if (!tokenizerCtor || !modelCtor) {
    throw new Error('Qwen reranker runtime unavailable');
  }

  const modelId = 'huggingworld/Qwen3-Reranker-0.6B-ONNX';

  const tokenizer = await tokenizerCtor.from_pretrained(modelId);
  const model = await modelCtor.from_pretrained(modelId, {
    dtype: 'q4',
    device: 'webgpu'
  });

  return { tokenizer, model };
}
