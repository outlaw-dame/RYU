import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./app/App";
import { scheduleSearchIndexHealthCheck } from "./search/index-lifecycle";
import { applySearchRuntimeSettings } from "./search/runtime-configure";
import "./design/tokens.css";

applySearchRuntimeSettings();
scheduleSearchIndexHealthCheck();

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
