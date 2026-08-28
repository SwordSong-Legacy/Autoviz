"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Lang = "en" | "zh";

interface LangState {
  lang: Lang;
  setLang: (lang: Lang) => void;
  toggleLang: () => void;
}

export const useLanguageStore = create<LangState>()(
  persist(
    (set) => ({
      lang: "zh",
      setLang: (lang) => set({ lang }),
      toggleLang: () => set((s) => ({ lang: s.lang === "en" ? "zh" : "en" })),
    }),
    {
      name: "lang-storage",
    }
  )
);
