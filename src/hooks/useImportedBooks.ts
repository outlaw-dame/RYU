import { useCallback, useEffect, useState } from "react";
import { initializeDatabase } from "../db/client";
import type { AuthorDoc, EditionDoc } from "../db/schema";

type ImportedBook = {
  id: string;
  title: string;
  author?: string;
  coverUrl?: string;
  sourceUrl?: string;
  authorUrl?: string;
};

function toPlainDoc<T>(doc: { toJSON: () => unknown }): T {
  return doc.toJSON() as T;
}

export function useImportedBooks(enabled: boolean) {
  const [books, setBooks] = useState<ImportedBook[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) return;

    setLoading(true);
    setError(null);
    try {
      const db = await initializeDatabase();
      const [editionDocs, authorDocs] = await Promise.all([
        db.editions.find().exec(),
        db.authors.find().exec()
      ]);
      const authorsById = new Map(
        authorDocs.map((doc) => {
          const author = toPlainDoc<AuthorDoc>(doc);
          return [author.id, author] as const;
        })
      );
      const importedBooks = editionDocs
        .map((doc) => toPlainDoc<EditionDoc>(doc))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .map((edition) => {
          const authorRecords = edition.authorIds
            .map((authorId) => authorsById.get(authorId))
            .filter((author): author is AuthorDoc => Boolean(author));
          const author = authorRecords.map((record) => record.name).join(", ");
          const authorUrl = authorRecords.find((record) => record.url)?.url;

          return {
            id: edition.id,
            title: edition.title,
            author: author || undefined,
            coverUrl: edition.coverUrl,
            sourceUrl: edition.sourceUrl,
            authorUrl
          };
        });

      setBooks(importedBooks);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { books, loading, error, reload };
}
