import { useCallback, useEffect, useState } from "react";
import { listImportedBooks, type LibraryBook } from "../db/library";

export function useImportedBooks(enabled: boolean) {
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) return;

    setLoading(true);
    setError(null);
    try {
      setBooks(await listImportedBooks());
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