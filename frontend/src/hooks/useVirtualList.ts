import { useMemo, useState, useCallback } from "react";

interface Options {
  itemHeight: number;
  containerHeight: number;
  overscan?: number;
}

/**
 * Minimal virtual-list math. Use the returned `start`, `end`, and `offsetY`
 * to render only the visible slice of a long list.
 */
export function useVirtualList<T>(items: T[], opts: Options) {
  const { itemHeight, containerHeight, overscan = 5 } = opts;
  const [scrollTop, setScrollTop] = useState(0);

  const onScroll = useCallback((e: React.UIEvent<HTMLElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const total = items.length * itemHeight;

  const { start, end, offsetY } = useMemo(() => {
    const first = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const visible = Math.ceil(containerHeight / itemHeight) + overscan * 2;
    const last = Math.min(items.length, first + visible);
    return { start: first, end: last, offsetY: first * itemHeight };
  }, [scrollTop, itemHeight, containerHeight, items.length, overscan]);

  const visible = useMemo(() => items.slice(start, end), [items, start, end]);

  return { visible, start, end, offsetY, total, onScroll };
}