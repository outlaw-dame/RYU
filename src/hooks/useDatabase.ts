import { useEffect, useState } from "react";
import { initializeDatabase } from "../db/client";

export type DatabaseState = "idle" | "loading" | "ready" | "error";

export function useDatabase() {
  const [state, setState] = useState<DatabaseState>("idle");
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    initializeDatabase()
      .then(() => { if (!cancelled) setState("ready"); })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setState("error");
        }
      });
    return () => { cancelled = true; };
  }, []);

  return { state, error };
}
