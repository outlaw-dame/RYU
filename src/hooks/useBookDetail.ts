/**
 * Phase 28 - useBookDetail hook.
 *
 * Returns full book (edition) details including associated reviews
 * for a given edition ID from the local RxDB database.
 */

import { useCallback, useEffect, useState } from "react";
import { initializeDatabase } from "../db/client";
import type { AuthorDoc, EditionDoc, ReviewDoc, WorkDoc } from "../db/schema";
import { getReadingStatus, type ReadingStatus, setReadingStatus } from "./useLibrary";

export type BookDetail = {
  edition: EditionDoc;
  authors: AuthorDoc[];
  work?: WorkDoc;
  reviews: ReviewDoc[];
  readingStatus?: ReadingStatus;
};

function toPlainDoc<T>(doc: { toJSON: () => unknown }): T {
  return doc.toJSON() as T;
}

function getReadingStatusForEdition(editionId: string): ReadingStatus | undefined {
  return getReadingStatus(editionId);
}

export function useBookDetail(editionId: string | null) {
  const [detail, setDetail] = useState<BookDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [statusVersion, setStatusVersion] = useState(0);

  const reload = useCallback(async () => {
    if (!editionId) {
      setDetail(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const db = await initializeDatabase();
      const editionDoc = await db.editions.findOne(editionId).exec();
      if (!editionDoc) {
        setDetail(null);
        setLoading(false);
        return;
      }

      const edition = toPlainDoc<EditionDoc>(editionDoc);

      const [authorDocs, reviewDocs, workDoc] = await Promise.all([
        edition.authorIds.length > 0
          ? db.authors.findByIds([...edition.authorIds]).exec().then((map: Map<string, { toJSON: () => unknown }>) => Array.from(map.values()))
          : Promise.resolve([]),
        db.reviews.find({ selector: { editionId: edition.id } }).exec(),
        edition.workId
          ? db.works.findOne(edition.workId).exec()
          : Promise.resolve(null)
      ]);

      const authors = authorDocs.map((doc: { toJSON: () => unknown }) => toPlainDoc<AuthorDoc>(doc));
      const reviews = reviewDocs.map((doc: { toJSON: () => unknown }) => toPlainDoc<ReviewDoc>(doc));
      const work = workDoc ? toPlainDoc<WorkDoc>(workDoc) : undefined;

      setDetail({
        edition,
        authors,
        work,
        reviews,
        readingStatus: getReadingStatusForEdition(edition.id)
      });
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [editionId, statusVersion]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const updateStatus = useCallback((status: ReadingStatus | undefined) => {
    if (!editionId) return;
    setReadingStatus(editionId, status);
    setStatusVersion((v) => v + 1);
  }, [editionId]);

  return { detail, loading, error, reload, updateStatus };
}
