"use client";

import { usePathname } from "next/navigation";
import LanguageSwitcher from "./LanguageSwitcher";
import ThemeSwitcher from "./ThemeSwitcher";
import TranslationRuntime from "./TranslationRuntime";

export default function GlobalLanguageControl() {
  const pathname = usePathname();
  const workspaceControl =
    pathname.startsWith("/admin") || pathname.startsWith("/merchant");

  return (
    <>
      <TranslationRuntime />
      <div
        className="gp-global-controls fixed bottom-4 right-4 z-[80] flex flex-col items-end gap-2 sm:flex-row"
      >
        <ThemeSwitcher />
        <LanguageSwitcher compact />
      </div>
    </>
  );
}
