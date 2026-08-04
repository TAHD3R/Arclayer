import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const OFFICIAL_SKILL_COPY_KEYS = [
  "SETTINGS_WORKSPACE_SKILLS_OFFICIAL_CREATOR_NAME",
  "SETTINGS_WORKSPACE_SKILLS_OFFICIAL_CREATOR_DESC",
  "SETTINGS_WORKSPACE_SKILLS_OFFICIAL_SITEMAP_NAME",
  "SETTINGS_WORKSPACE_SKILLS_OFFICIAL_SITEMAP_DESC",
  "SETTINGS_WORKSPACE_SKILLS_OFFICIAL_WIREFRAME_NAME",
  "SETTINGS_WORKSPACE_SKILLS_OFFICIAL_WIREFRAME_DESC",
  "SETTINGS_WORKSPACE_SKILLS_OFFICIAL_STYLE_NAME",
  "SETTINGS_WORKSPACE_SKILLS_OFFICIAL_STYLE_DESC",
  "SETTINGS_WORKSPACE_SKILLS_OFFICIAL_DESIGN_NAME",
  "SETTINGS_WORKSPACE_SKILLS_OFFICIAL_DESIGN_DESC",
  "SETTINGS_WORKSPACE_SKILLS_OFFICIAL_EDITORIAL_NAME",
  "SETTINGS_WORKSPACE_SKILLS_OFFICIAL_EDITORIAL_DESC",
] as const;

describe("Platform built-in Skill translations", () => {
  it.each(["en-US", "zh-CN"])("matches Product catalog copy for %s", (locale) => {
    const platformCopy = readJson(`locales/${locale}/ai.json`);
    const productCopy = readJson(`../../locales/${locale}/settings.json`);

    for (const key of OFFICIAL_SKILL_COPY_KEYS) {
      expect(platformCopy[key], key).toBe(productCopy[key]);
    }
  });
});

function readJson(relativePath: string): Record<string, string> {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf8"));
}
