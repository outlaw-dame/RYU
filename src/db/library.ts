import { getDatabase } from "./client";

export type LibraryBook = {
  id: string;
  title: string;
  author?: string;
  coverUrl?: string;
  sourceUrl: string;
};

export async function listImportedBooks(limit = 12): Promise<LibraryBook[]> {
  const db = await getDatabase();
  const editionDocs = await db.editions.find({
    sort: [{ importedAt: "desc" }],
    limit
  }).exec();

  const editions = editionDocs.map((doc) => doc.toJSON());
  const authorIds = Array.from(new Set(editions.flatMap((edition) => edition.authorIds ?? [])));
  const authorDocs = authorIds.length > 0 ? await db.authors.findByIds(authorIds).exec() : new Map();

  return editions.map((edition) => ({
    id: edition.id,
    title: edition.title,
    author: (edition.authorIds ?? [])
      .map((authorId: string) => authorDocs.get(authorId)?.toJSON().name)
      .filter(Boolean)
      .join(", ") || undefined,
    coverUrl: edition.coverUrl,
    sourceUrl: edition.sourceUrl
  }));
}