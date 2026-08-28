"use client";

import { useLanguageStore } from "@/stores/lang-store";
import { T } from "@/i18n/translations";
import type { Lang } from "@/stores/lang-store";

export function useLang() {
  const { lang, setLang, toggleLang } = useLanguageStore();
  const t = T[lang];
  return { t, lang, setLang, toggleLang };
}

export type { Lang };
