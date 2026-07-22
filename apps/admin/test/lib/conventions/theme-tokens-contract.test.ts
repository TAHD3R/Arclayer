import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../../..");
const TOKENS_CSS_PATH = path.join(REPO_ROOT, "packages/ui/src/tokens.css");

describe("shared theme tokens", () => {
  it("separates the light canvas, cards, and sidebar", async () => {
    const tokensCss = await fs.readFile(TOKENS_CSS_PATH, "utf-8");

    expect(tokensCss).toContain("--background: hsl(220 14% 97%);");
    expect(tokensCss).toContain("--card: hsl(0 0% 100%);");
    expect(tokensCss).toContain("--sidebar: hsl(220 12% 94%);");
  });

  it("uses neutral gray surfaces in dark mode", async () => {
    const tokensCss = await fs.readFile(TOKENS_CSS_PATH, "utf-8");
    const darkTheme = tokensCss.slice(tokensCss.indexOf('[data-theme="dark"]'));

    expect(darkTheme).toContain("--card: hsl(0 0% 8%);");
    expect(darkTheme).toContain("--accent: hsl(0 0% 14%);");
    expect(darkTheme).toContain("--sidebar: hsl(0 0% 5%);");
    expect(darkTheme).not.toMatch(/--(?:card|popover|muted|accent|sidebar): hsl\(220 /);
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
