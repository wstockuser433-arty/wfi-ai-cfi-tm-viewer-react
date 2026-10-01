import { useEffect } from "react";
import { StatusBar } from "./components/layout/StatusBar";
import { Sidebar } from "./components/layout/Sidebar";
import { useTelemetryStream } from "./hooks/useTelemetryStream";
import { useMeta } from "./hooks/useMeta";
import { useUiStore } from "./store/uiStore";
import { useTheme } from "./hooks/useTheme";
import { useSettings } from "./store/settingsStore";
import { ErrorBoundary } from "./components/ErrorBoundary";

import { LivePage } from "./pages/LivePage";
import { AlarmsPage } from "./pages/AlarmsPage";
import { TrendsPage } from "./pages/TrendsPage";
import { StoragePage } from "./pages/StoragePage";
import { InspectorPage } from "./pages/InspectorPage";  // optional
// import { PlaybackPage } from "./pages/PlaybackPage";    // optional
// import { LinksPage } from "./pages/LinksPage";          // optional


export default function App() {
  useTheme();  // applies theme to <html> and listens for OS changes
  useMeta();
    
  const wsUrl = useSettings((s) => s.api.wsUrl);  // live updates if user changes settings
  useTelemetryStream(wsUrl);
  
  const page = useUiStore((s) => s.activePage);
  const setPage = useUiStore((s) => s.setPage);

  // Init page on mount
  useEffect(() => {
    if (!page) setPage("dashboard");
  }, [page, setPage]);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <ErrorBoundary>
        <StatusBar />
      </ErrorBoundary>

      <div className="flex flex-1 min-h-0">
        <ErrorBoundary>
          <Sidebar />
        </ErrorBoundary>

        <main className="flex-1 min-h-0 overflow-auto p-4">
          <ErrorBoundary>
            {page === "dashboard" && <LivePage />}
            {page === "alarms"    && <AlarmsPage />}
            {page === "trends"    && <TrendsPage />}
            {page === "storage"   && <StoragePage />}
            {page === "inspector" && <InspectorPage />}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}