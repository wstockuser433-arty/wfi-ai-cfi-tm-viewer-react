import { StatusBar } from "./components/layout/StatusBar";
import { Sidebar } from "./components/layout/Sidebar";
import { useTelemetryStream } from "./hooks/useTelemetryStream";
import { useMeta } from "./hooks/useMeta";
import { KpiCards } from "./components/live/KpiCards";
import { LiveChart } from "./components/live/LiveChart";
import { PacketDecoder } from "./components/live/PacketDecoder";
import { AlarmRail } from "./components/live/AlarmRail";
import { LinkHealthStrip } from "./components/live/LinkHealthStrip";
import { ErrorBoundary } from "./components/ErrorBoundary";

export default function App() {
  useMeta();
  useTelemetryStream();

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <ErrorBoundary>
        <StatusBar />
      </ErrorBoundary>

      <div className="flex flex-1 min-h-0">
        <ErrorBoundary>
          <Sidebar />
        </ErrorBoundary>

        <main className="flex-1 min-h-0 overflow-auto p-4 space-y-4">
          <ErrorBoundary>
            <LinkHealthStrip />
          </ErrorBoundary>

          <ErrorBoundary>
            <KpiCards />
          </ErrorBoundary>

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <ErrorBoundary>
                <LiveChart />
              </ErrorBoundary>
            </div>
            <ErrorBoundary>
              <AlarmRail />
            </ErrorBoundary>
          </div>

          <ErrorBoundary>
            <PacketDecoder />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}