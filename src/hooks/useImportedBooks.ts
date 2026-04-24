import { useCallback, useEffect, useState } from "react";
import { initializeDatabase } from "../db/client";
import type { AuthorDoc, EditionDoc } from "../db/schema";

type ImportedBook = {
  id: string;
  title: string;
  author?: string;
  coverUrl?: string;
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
          const author = edition.authorIds
            .map((authorId) => authorsById.get(authorId)?.name)
            .filter((name): name is string => Boolean(name))
            .join(", ");

          return {
            id: edition.id,
            title: edition.title,
            author: author || undefined,
            coverUrl: edition.coverUrl
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
