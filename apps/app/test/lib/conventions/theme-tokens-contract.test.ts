import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../../..");
const TOKENS_CSS_PATH = path.join(REPO_ROOT, "packages/ui/src/tokens.css");

describe("shared theme tokens", () => {
  it("separates the light canvas, cards, and sidebar", async () => {
    const tokensCss = await fs.readFile(TOKENS_CSS_PATH, "utf-8");

    expect(tokensCss).toContain("--background: oklch(0.985 0 0);");
    expect(tokensCss).toContain("--card: oklch(1 0 0);");
    expect(tokensCss).toContain("--sidebar: oklch(0.97 0 0);");
  });

  it("keeps the OKX monochrome primary across themes", async () => {
    const tokensCss = await fs.readFile(TOKENS_CSS_PATH, "utf-8");
    const darkTheme = tokensCss.slice(tokensCss.indexOf('[data-theme="dark"]'));

    expect(tokensCss).toContain("--primary: oklch(0 0 0);");
    expect(tokensCss).toContain("--primary-foreground: oklch(1 0 0);");
    expect(darkTheme).toContain("--primary: oklch(1 0 0);");
    expect(darkTheme).toContain("--primary-foreground: oklch(0 0 0);");
  });

  it("uses neutral gray surfaces in dark mode", async () => {
    const tokensCss = await fs.readFile(TOKENS_CSS_PATH, "utf-8");
    const darkTheme = tokensCss.slice(tokensCss.indexOf('[data-theme="dark"]'));

    expect(darkTheme).toContain("--card: oklch(0.191 0 0);");
    expect(darkTheme).toContain("--popover: oklch(0.191 0 0);");
    expect(darkTheme).toContain("--muted: oklch(0.213 0 0);");
    expect(darkTheme).toContain("--accent: oklch(0.239 0 0);");
    expect(darkTheme).toContain("--sidebar: oklch(0.159 0 0);");
  });

  it("uses one proportional system font role with CJK-first fallbacks", async () => {
    const tokensCss = await fs.readFile(TOKENS_CSS_PATH, "utf-8");

    expect(tokensCss).not.toContain("@fontsource");
    expect(tokensCss).toContain('"PingFang SC"');
    expect(tokensCss).toContain('"Microsoft YaHei"');
    expect(tokensCss).toContain("--font-serif: var(--font-sans);");
  });

  it("provides a rounder radius scale", async () => {
    const tokensCss = await fs.readFile(TOKENS_CSS_PATH, "utf-8");

    expect(tokensCss).toContain("--radius-sm: 6px;");
    expect(tokensCss).toContain("--radius-xl: 20px;");
    expect(tokensCss).toContain("--radius-3xl: 32px;");
  });
});
