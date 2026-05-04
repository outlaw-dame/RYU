import { initializeDatabase, type RyuDatabase } from "../db/client";
import { buildDiscoveryQueryPlan } from "../sync/discovery-query";

export type SearchQueryExpansionPlan = {
  normalizedQuery: string;
  /** Enriched form for lexical search (camelCase splits + de-hashed tokens). */
  lexicalQuery: string;
  semanticQuery: string;
  variants: string[];
};

export async function buildSearchQueryExpansionPlan(query: string, db?: RyuDatabase): Promise<SearchQueryExpansionPlan> {
  const discovery = buildDiscoveryQueryPlan(query, { maxVariants: 8 });
  const normalizedQuery = discovery.normalizedQuery;

  if (!normalizedQuery) {
    return {
      normalizedQuery,
      lexicalQuery: "",
      semanticQuery: "",
      variants: []
    };
  }

  const database = db ?? await initializeDatabase();
  const knowledgeVariants = await resolveKnowledgeVariants(normalizedQuery, database);

  const variants = Array.from(new Set([
    normalizedQuery,
    ...discovery.variants,
    ...knowledgeVariants
  ]))
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 8);

  return {
    normalizedQuery,
    lexicalQuery: discovery.lexicalQuery || normalizedQuery,
    semanticQuery: variants.join(" "),
    variants
  };
}

async function resolveKnowledgeVariants(normalizedQuery: string, db: RyuDatabase): Promise<string[]> {
  if (!db.entitylinks) {
    return [];
  }
  const docs = await db.entitylinks.find({
    selector: {
      source: { $in: ["wikidata", "dbpedia", "open_library", "google_books"] },
      confidence: { $gte: 0.6 }
    },
    sort: [{ confidence: "desc" }],
    limit: 120
  }).exec();

  const tokens = normalizedQuery.split(/\s+/g).filter((token) => token.length >= 3);
  if (tokens.length === 0) {
    return [];
  }

  const variants = new Set<string>();

  for (const doc of docs as Array<{ label?: string; description?: string; query: string; externalUri: string }>) {
    const haystack = `${doc.label ?? ""} ${doc.description ?? ""} ${doc.query ?? ""}`.toLowerCase();
    if (!tokens.some((token) => haystack.includes(token))) {
      continue;
    }

    if (doc.label) {
      variants.add(doc.label.toLowerCase());
    }

    const uriTail = decodeURIComponent(doc.externalUri.split("/").pop() ?? "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

    if (uriTail && !/^q\d+$/i.test(uriTail)) {
      variants.add(uriTail);
    }

    if (variants.size >= 6) {
      break;
    }
  }

  return Array.from(variants);
}
