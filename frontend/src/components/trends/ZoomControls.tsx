import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { Button } from "../ui/button";

interface Props {
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onReset?: () => void;
}

export function ZoomControls({ onZoomIn, onZoomOut, onReset }: Props) {
  return (
    <div className="flex items-center gap-1">
      <Button onClick={onZoomIn} className="p-1.5" title="Zoom in">
        <ZoomIn className="w-3.5 h-3.5" />
      </Button>
      <Button onClick={onZoomOut} className="p-1.5" title="Zoom out">
        <ZoomOut className="w-3.5 h-3.5" />
      </Button>
      <Button onClick={onReset} className="p-1.5" title="Reset">
        <Maximize2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}