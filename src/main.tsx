import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./app/App";
import { scheduleSearchIndexHealthCheck } from "./search/index-lifecycle";
import { applySearchRuntimeSettings } from "./search/runtime-configure";
import "./design/tokens.css";

applySearchRuntimeSettings();

// Avoid startup contention by scheduling non-critical index health checks during idle time.
if (typeof window !== "undefined") {
  const withIdle = window as Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  };

  if (typeof withIdle.requestIdleCallback === "function") {
    withIdle.requestIdleCallback(() => {
      scheduleSearchIndexHealthCheck();
    }, { timeout: 2_000 });
  } else {
    window.setTimeout(() => {
      scheduleSearchIndexHealthCheck();
    }, 450);
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 1000 * 60 * 60,
      retry: 2,
      refetchOnWindowFocus: false
    }
  }
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
      console.warn("Service worker registration failed", error);
    });
  });
}
