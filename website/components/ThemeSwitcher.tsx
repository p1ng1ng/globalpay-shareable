"use client";

import { useTheme } from "./ThemeProvider";

export default function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="gp-floating-control flex items-center gap-1 rounded-xl border p-1 shadow-2xl shadow-black/30 backdrop-blur-xl">
      {(["dark", "light"] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => setTheme(mode)}
          className={`rounded-lg px-3 py-2 text-xs font-black capitalize ${
            theme === mode ? "gp-switch-option-active" : "gp-switch-option"
          }`}
          aria-pressed={theme === mode}
        >
          {mode}
        </button>
      ))}
    </div>
  );
}
