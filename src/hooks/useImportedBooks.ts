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

function normalizeCoverUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:") {
      parsed.protocol = "https:";
      return parsed.toString();
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function openLibraryCoverFromIsbn(isbn10?: string, isbn13?: string): string | undefined {
  const isbn = (isbn13 || isbn10 || "").replace(/[^0-9Xx]/g, "");
  if (!isbn) return undefined;
  return `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-M.jpg`;
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
      const editionRows = editionDocs.map((doc) => ({
        doc,
        edition: toPlainDoc<EditionDoc>(doc)
      }));

      const coverUpdates = editionRows.flatMap(({ edition }) => {
        const normalized = normalizeCoverUrl(edition.coverUrl);
        const fallback = openLibraryCoverFromIsbn(edition.isbn10, edition.isbn13);
        const nextCover = normalized || fallback;

        if (!nextCover || nextCover === edition.coverUrl) {
          return [];
        }

        return [{ id: edition.id, coverUrl: nextCover }] as const;
      });

      const importedBooks = editionRows
        .map(({ edition }) => edition)
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
            coverUrl: normalizeCoverUrl(edition.coverUrl) || openLibraryCoverFromIsbn(edition.isbn10, edition.isbn13),
            sourceUrl: edition.sourceUrl,
            authorUrl
          };
        });

      if (coverUpdates.length > 0) {
        const now = new Date().toISOString();
        void Promise.all(
          coverUpdates.map(async (update) => {
            const target = editionDocs.find((doc) => doc.primary === update.id);
            if (!target) return;
            await target.incrementalPatch({
              coverUrl: update.coverUrl,
              updatedAt: now
            });
          })
        ).catch(() => {
          // Best-effort persistence: rendering should continue even if writeback fails.
        });
      }

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
