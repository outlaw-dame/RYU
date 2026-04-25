export async function fetchOpenGraph(url: string) {
  const res = await fetch(url, { headers: { Accept: 'text/html' } });
  if (!res.ok) return null;

  const html = await res.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const get = (prop: string) =>
    doc.querySelector(`meta[property=\"${prop}\"]`)?.getAttribute('content');

  return {
    title: get('og:title'),
    description: get('og:description'),
    image: get('og:image'),
    url: get('og:url')
  };
}
