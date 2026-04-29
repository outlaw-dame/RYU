export function hashText(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return String(hash);
}

export function vectorId(entityId: string, model: string, dimensions: number): string {
  return `${model}:${dimensions}:${entityId}`;
}
