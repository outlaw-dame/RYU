import { initializeDatabase } from "../db/client";
import type { RelayEntity } from "./relay-discovery";

/**
 * Build a RelayEntity catalog from the local RxDB store: authors, works, and editions.
 * These entities power entity-aware relay discovery — recognizing posts that mention
 * authors/books/comics even when no hashtag is present.
 *
 * Author names contribute as `author` entities; work/edition titles contribute as `book`
 * entities. The local discovery seed catalog can be merged in by the caller.
 */
export async function buildLocalRelayEntityCatalog(): Promise<RelayEntity[]> {
  try {
    const db = await initializeDatabase();
    const [authorDocs, workDocs, editionDocs] = await Promise.all([
      db.authors.find().exec(),
      db.works.find().exec(),
      db.editions.find().exec(),
    ]);

    const entities: RelayEntity[] = [];

    for (const doc of authorDocs) {
      const data = doc.toJSON ? doc.toJSON() : (doc as unknown as { id: string; name: string });
      const name = (data.name || "").trim();
      if (name.length < 3) continue;
      entities.push({
        id: `author:${data.id}`,
        type: "author",
        label: name,
        aliases: [name],
      });
    }

    for (const doc of workDocs) {
      const data = doc.toJSON ? doc.toJSON() : (doc as unknown as { id: string; title: string });
      const title = (data.title || "").trim();
      if (title.length < 3) continue;
      entities.push({
        id: `work:${data.id}`,
        type: "work",
        label: title,
        aliases: [title],
      });
    }

    for (const doc of editionDocs) {
      const data = doc.toJSON ? doc.toJSON() : (doc as unknown as { id: string; title: string });
      const title = (data.title || "").trim();
      if (title.length < 3) continue;
      entities.push({
        id: `edition:${data.id}`,
        type: "edition",
        label: title,
        aliases: [title],
      });
    }

    return entities;
  } catch (error) {
    console.warn("Failed to build local relay entity catalog:", error);
    return [];
  }
}
