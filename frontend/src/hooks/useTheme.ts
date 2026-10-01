import { useEffect } from "react";
import { useSettings, type ThemeMode } from "@/store/settingsStore";

/**
 * Applies the current theme to <html>:
 *   - "dark"   → adds class "dark", removes "light"
 *   - "light"  → adds class "light", removes "dark"
 *   - "system" → follows OS preference (prefers-color-scheme)
 *
 * Listens for OS preference changes when in "system" mode.
 */
export function useTheme(): ThemeMode {
  const theme = useSettings((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");

    const apply = (isDark: boolean) => {
      root.classList.toggle("dark", isDark);
      root.classList.toggle("light", !isDark);
      root.style.colorScheme = isDark ? "dark" : "light";
    };

    const compute = () => {
      if (theme === "system") return mql.matches;
      return theme === "dark";
    };

    apply(compute());

    // Follow OS changes only while in "system"
    const onChange = () => {
      if (theme === "system") apply(mql.matches);
    };

    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [theme]);

  return theme;
}