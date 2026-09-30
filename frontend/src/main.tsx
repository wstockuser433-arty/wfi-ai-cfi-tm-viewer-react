import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";

// ---------------------------------------------------------------------- //
// React Query client — shared across the app
// ---------------------------------------------------------------------- //
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,       // meta fetched once, reused
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// ---------------------------------------------------------------------- //
// Mount
// ---------------------------------------------------------------------- //
const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error(
    "Root element #root not found. Check frontend/index.html contains <div id=\"root\"></div>."
  );
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);