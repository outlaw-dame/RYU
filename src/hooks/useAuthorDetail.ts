/**
 * Phase 28 - useAuthorDetail hook.
 *
 * Returns author info along with their works and editions
 * from the local RxDB database.
 */

import { useCallback, useEffect, useState } from "react";
import { initializeDatabase } from "../db/client";
import type { AuthorDoc, EditionDoc, WorkDoc } from "../db/schema";

export type AuthorDetail = {
  author: AuthorDoc;
  works: WorkDoc[];
  editions: EditionDoc[];
};

function toPlainDoc<T>(doc: { toJSON: () => unknown }): T {
  return doc.toJSON() as T;
}

export function useAuthorDetail(authorId: string | null) {
  const [detail, setDetail] = useState<AuthorDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const reload = useCallback(async () => {
    if (!authorId) {
      setDetail(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const db = await initializeDatabase();
      const authorDoc = await db.authors.findOne(authorId).exec();
      if (!authorDoc) {
        setDetail(null);
        setLoading(false);
        return;
      }

      const author = toPlainDoc<AuthorDoc>(authorDoc);

      // Find works and editions that include this author
      const [workDocs, editionDocs] = await Promise.all([
        db.works.find().exec(),
        db.editions.find().exec()
      ]);

      const works = workDocs
        .map((doc) => toPlainDoc<WorkDoc>(doc))
        .filter((work) => work.authorIds.includes(authorId));

      const editions = editionDocs
        .map((doc) => toPlainDoc<EditionDoc>(doc))
        .filter((edition) => edition.authorIds.includes(authorId));

      setDetail({ author, works, editions });
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [authorId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { detail, loading, error, reload };
}
