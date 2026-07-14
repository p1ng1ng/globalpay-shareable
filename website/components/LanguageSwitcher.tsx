"use client";

import { AppLanguage, languageLabels, saveLanguage } from "@/lib/i18n";
import { useLanguage } from "./LanguageProvider";

type LanguageSwitcherProps = {
  language?: AppLanguage;
  onChange?: (language: AppLanguage) => void;
  compact?: boolean;
};

export default function LanguageSwitcher({
  language: controlledLanguage,
  onChange,
  compact = false,
}: LanguageSwitcherProps) {
  const context = useLanguage();
  const language = controlledLanguage || context.language;

  function changeLanguage(nextLanguage: AppLanguage) {
    saveLanguage(nextLanguage);
    context.setLanguage(nextLanguage);
    onChange?.(nextLanguage);
  }

  return (
    <div className="gp-floating-control flex items-center gap-2 rounded-xl border px-3 py-2 shadow-2xl shadow-black/30 backdrop-blur-xl">
      <span className="gp-floating-muted text-xs font-bold">
        {compact ? "EN / 中文" : "Language"}
      </span>

      <select
        value={language}
        onChange={(event) => changeLanguage(event.target.value as AppLanguage)}
        className="gp-floating-select text-sm font-black outline-none"
        aria-label="Language"
      >
        <option value="en">{languageLabels.en}</option>
        <option value="zh">{languageLabels.zh}</option>
      </select>
    </div>
  );
}
