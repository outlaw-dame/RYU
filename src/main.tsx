import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Framework7 from "framework7/lite-bundle";
import Framework7React from "framework7-react";
import { App as F7App, View } from "framework7-react";
import "framework7/css/bundle";
import { applySearchRuntimeSettings } from "./search/runtime-configure";
import "./design/tokens.css";
import "./i18n";
import { PlatformProvider } from "./platform/PlatformProvider";

// Initialize Framework7 with React plugin (exactly once)
Framework7.use(Framework7React);

const App = React.lazy(() => import("./app/App").then((module) => ({ default: module.App })));

applySearchRuntimeSettings();

// Avoid startup contention by scheduling non-critical index health checks during idle time.
if (typeof window !== "undefined") {
  const withIdle = window as Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  };

  if (typeof withIdle.requestIdleCallback === "function") {
    withIdle.requestIdleCallback(async () => {
      const { scheduleSearchIndexHealthCheck } = await import("./search/index-lifecycle");
      scheduleSearchIndexHealthCheck();
    }, { timeout: 2_000 });
  } else {
    window.setTimeout(async () => {
      const { scheduleSearchIndexHealthCheck } = await import("./search/index-lifecycle");
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

// Framework7 configuration — theme "auto" picks iOS on Apple, Material elsewhere
const f7Params = {
  name: "Ryu",
  theme: "auto" as const,
  darkMode: "auto" as const,
  iosTranslucentBars: true,
  iosTranslucentModals: true,
  colors: {
    primary: "#5856d6"
  }
};

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <PlatformProvider>
        <F7App {...f7Params}>
          <View main>
            <React.Suspense fallback={null}>
              <App />
            </React.Suspense>
          </View>
        </F7App>
      </PlatformProvider>
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
