import { Radio, History } from "lucide-react";
import { useUiStore } from "@/store/uiStore";
import { cn } from "@/lib/utils";

export function ModeSwitch() {
  const mode = useUiStore(s => s.mode);
  const setMode = useUiStore(s => s.setMode);

  return (
    <div className="flex items-center bg-white/5 border border-white/10 rounded-md p-0.5">
      <button
        onClick={() => setMode("live")}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1 text-xs rounded transition-colors",
          mode === "live" ? "bg-accent-cyan/15 text-accent-cyan" : "text-muted hover:text-white"
        )}
      >
        <Radio className="w-3 h-3" /> Live
      </button>
      <button
        onClick={() => setMode("playback")}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1 text-xs rounded transition-colors",
          mode === "playback" ? "bg-accent-amber/15 text-accent-amber" : "text-muted hover:text-white"
        )}
      >
        <History className="w-3 h-3" /> Playback
      </button>
    </div>
  );
}