export function highlight(text: string, query: string): string {
  if (!text || !query) return text;

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');

  return text.replace(regex, '<mark>$1</mark>');
}
