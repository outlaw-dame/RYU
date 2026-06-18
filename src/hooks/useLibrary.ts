/**
 * Phase 28 - useLibrary hook.
 *
 * Returns the user's library organized by reading status.
 * Reading status is persisted to localStorage (no schema migration needed).
 * Provides filtering and search within library using existing search infrastructure.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { initializeDatabase } from "../db/client";
import type { AuthorDoc, EditionDoc } from "../db/schema";
import { searchAll } from "../search/search";

export type ReadingStatus = "want-to-read" | "reading" | "read" | "did-not-finish";

export type LibraryBook = {
  id: string;
  title: string;
  author?: string;
  coverUrl?: string;
  isbn10?: string;
  isbn13?: string;
  sourceUrl?: string;
  authorUrl?: string;
  readingStatus?: ReadingStatus;
};

export type LibraryData = {
  all: LibraryBook[];
  wantToRead: LibraryBook[];
  reading: LibraryBook[];
  read: LibraryBook[];
  didNotFinish: LibraryBook[];
};

const STORAGE_KEY_PREFIX = "ryu.reading-status.";

export function getReadingStatus(editionId: string): ReadingStatus | undefined {
  try {
    const value = window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${editionId}`);
    if (value === "want-to-read" || value === "reading" || value === "read" || value === "did-not-finish") {
      return value;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function setReadingStatus(editionId: string, status: ReadingStatus | undefined): void {
  try {
    if (status === undefined) {
      window.localStorage.removeItem(`${STORAGE_KEY_PREFIX}${editionId}`);
    } else {
      window.localStorage.setItem(`${STORAGE_KEY_PREFIX}${editionId}`, status);
    }
  } catch {
    // Ignore storage failures.
  }
}

function toPlainDoc<T>(doc: { toJSON: () => unknown }): T {
  return doc.toJSON() as T;
}

export function useLibrary() {
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [filter, setFilter] = useState<ReadingStatus | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<LibraryBook[] | null>(null);
  const [statusVersion, setStatusVersion] = useState(0);

  const reload = useCallback(async () => {
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
      const libraryBooks = editionDocs
        .map((doc) => toPlainDoc<EditionDoc>(doc))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .map((edition): LibraryBook => {
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
            isbn10: edition.isbn10,
            isbn13: edition.isbn13,
            sourceUrl: edition.sourceUrl,
            authorUrl,
            readingStatus: getReadingStatus(edition.id)
          };
        });

      setBooks(libraryBooks);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, statusVersion]);

  const updateStatus = useCallback((editionId: string, status: ReadingStatus | undefined) => {
    setReadingStatus(editionId, status);
    setStatusVersion((v) => v + 1);
  }, []);

  const library = useMemo((): LibraryData => {
    return {
      all: books,
      wantToRead: books.filter((b) => b.readingStatus === "want-to-read"),
      reading: books.filter((b) => b.readingStatus === "reading"),
      read: books.filter((b) => b.readingStatus === "read"),
      didNotFinish: books.filter((b) => b.readingStatus === "did-not-finish")
    };
  }, [books]);

  const filteredBooks = useMemo((): LibraryBook[] => {
    if (searchResults !== null) return searchResults;
    if (filter === "all") return library.all;
    if (filter === "want-to-read") return library.wantToRead;
    if (filter === "reading") return library.reading;
    if (filter === "read") return library.read;
    return library.didNotFinish;
  }, [filter, library, searchResults]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      const search = async () => {
        try {
          const grouped = await searchAll(searchQuery, {
            context: { surface: "library" }
          });
          if (cancelled) return;
          if (!grouped) {
            setSearchResults([]);
            return;
          }
          const matchedIds = new Set(grouped.all.map((r) => r.id));
          const filtered = books.filter((b) => matchedIds.has(b.id));
          setSearchResults(filtered);
        } catch {
          if (!cancelled) setSearchResults([]);
        }
      };
      void search();
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, books]);

  return {
    library,
    filteredBooks,
    loading,
    error,
    filter,
    setFilter,
    searchQuery,
    setSearchQuery,
    updateStatus,
    reload
  };
}
