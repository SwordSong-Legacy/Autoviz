import { describe, it, expect, beforeEach } from "vitest";
import { useLanguageStore } from "./lang-store";

describe("useLanguageStore", () => {
  beforeEach(() => {
    useLanguageStore.setState({ lang: "zh" });
  });

  it("defaults to zh", () => {
    expect(useLanguageStore.getState().lang).toBe("zh");
  });

  it("setLang switches to en", () => {
    useLanguageStore.getState().setLang("en");
    expect(useLanguageStore.getState().lang).toBe("en");
  });

  it("setLang switches back to zh", () => {
    useLanguageStore.getState().setLang("en");
    useLanguageStore.getState().setLang("zh");
    expect(useLanguageStore.getState().lang).toBe("zh");
  });

  it("toggleLang switches from zh to en", () => {
    useLanguageStore.getState().toggleLang();
    expect(useLanguageStore.getState().lang).toBe("en");
  });

  it("toggleLang switches from en to zh", () => {
    useLanguageStore.setState({ lang: "en" });
    useLanguageStore.getState().toggleLang();
    expect(useLanguageStore.getState().lang).toBe("zh");
  });
});
