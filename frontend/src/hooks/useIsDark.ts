import { useEffect, useState } from "react";

/** Returns true when <html> has the "dark" class. Reactive to changes. */
export function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains("dark")
  );

  useEffect(() => {
    const el = document.documentElement;
    const obs = new MutationObserver(() => {
      setIsDark(el.classList.contains("dark"));
    });
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  return isDark;
}