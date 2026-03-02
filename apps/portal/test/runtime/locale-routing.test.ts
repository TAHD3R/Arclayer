import { describe, expect, it } from "vitest";

import {
  canonicalizeLocale,
  joinLocalePath,
  resolveCookieLocale,
  splitLocalePrefix,
} from "@/runtime/locale-routing";

describe("Portal locale routing helpers", () => {
  it("joinLocalePath() prefixes locale and preserves normalized pathname", () => {
    expect(joinLocalePath("en-US", "/")).toBe("/en-US");
    expect(joinLocalePath("en-US", "/about")).toBe("/en-US/about");
    expect(joinLocalePath("en-US", "about")).toBe("/en-US/about");
  });

  it("canonicalizeLocale() matches supported locales case-insensitively", () => {
    const supported = ["zh-CN", "en-US"];
    expect(canonicalizeLocale("en-us", supported)).toBe("en-US");
    expect(canonicalizeLocale("ZH-cn", supported)).toBe("zh-CN");
    expect(canonicalizeLocale("fr", supported)).toBeNull();
  });

  it("splitLocalePrefix() extracts locale prefix and returns pathname without prefix", () => {
    const supported = ["zh-CN", "en-US", "zh-Hant-TW"];

    expect(splitLocalePrefix("/", supported)).toEqual({
      prefixCandidate: null,
      canonicalLocaleFromUrl: null,
      pathnameNoLocale: "/",
    });

    expect(splitLocalePrefix("/en-us/test", supported)).toEqual({
      prefixCandidate: "en-us",
      canonicalLocaleFromUrl: "en-US",
      pathnameNoLocale: "/test",
    });

    expect(splitLocalePrefix("/zh-Hant-TW/about", supported)).toEqual({
      prefixCandidate: "zh-Hant-TW",
      canonicalLocaleFromUrl: "zh-Hant-TW",
      pathnameNoLocale: "/about",
    });

    // Unsupported locale-like prefix: should strip it but mark as unsupported.
    expect(splitLocalePrefix("/fr/about", supported)).toEqual({
      prefixCandidate: "fr",
      canonicalLocaleFromUrl: null,
      pathnameNoLocale: "/about",
    });

    // Non-locale prefix: should not treat it as locale prefix.
    expect(splitLocalePrefix("/about", supported)).toEqual({
      prefixCandidate: null,
      canonicalLocaleFromUrl: null,
      pathnameNoLocale: "/about",
    });
  });

  it("resolveCookieLocale() reads celestial_locale and canonicalizes it", () => {
    const supported = ["zh-CN", "en-US"];
    expect(resolveCookieLocale({ cookie: "a=b; celestial_locale=en-us" }, supported)).toBe("en-US");
    expect(resolveCookieLocale({ cookie: "celestial_locale=%7A%68-CN" }, supported)).toBe("zh-CN");
    expect(resolveCookieLocale({ cookie: "celestial_locale=fr" }, supported)).toBeNull();
  });
});
