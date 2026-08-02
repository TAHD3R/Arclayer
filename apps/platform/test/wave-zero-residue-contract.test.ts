import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const PLATFORM_SOURCE_ROOT = path.join(REPOSITORY_ROOT, "apps/platform/src");
const PLATFORM_ROUTE_ALIAS =
  /(?:createFileRoute|to|href|redirect|navigate)\s*(?:\(|:|=)?\s*["'`]\/(?:system|platform)(?:\/|["'`?])/;
const COMPATIBILITY_FACADE =
  /\b(?:LegacyPlatform|PlatformCompatibility|ProductPlatformCompatibility|PlatformFacade|ProductFacade|SystemSettingsLayout|SystemDirectoryShell)\b/;
const REMOVED_AUTHORITY =
  /\b(?:require_super_admin|requireSuperAdmin|is_creator_admin|isCreatorAdmin)\b/;
const ASSIGNABLE_WORKSPACE_OWNER_ROLE =
  /(?:workspace(?:_|-|:)?role|workspaceRole)[\s\S]{0,120}["']owner["']|["']owner["'][\s\S]{0,120}(?:workspace(?:_|-|:)?role|workspaceRole)|["']workspace[:._-]owner["']/i;

async function platformSourceFiles(): Promise<readonly string[]> {
  const entries = await readdir(PLATFORM_SOURCE_ROOT, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

describe("Wave 0 Platform hard-cut residue", () => {
  it("owns only unprefixed Platform routes", async () => {
    const files = await platformSourceFiles();
    const relativePaths = files.map((file) => path.relative(REPOSITORY_ROOT, file));
    const sources = await Promise.all(
      files.map(async (file) => ({ file, source: await readFile(file, "utf8") })),
    );

    expect(
      relativePaths.filter((file) => /\/routes\/(?:system|platform)(?:\/|$)/.test(file)),
    ).toEqual([]);
    expect(
      sources
        .filter(({ source }) => PLATFORM_ROUTE_ALIAS.test(source))
        .map(({ file }) => path.relative(REPOSITORY_ROOT, file)),
    ).toEqual([]);
  });

  it("does not import Product Application source or Product API client types", async () => {
    const [files, packageJson, viteConfig] = await Promise.all([
      platformSourceFiles(),
      readFile(path.join(REPOSITORY_ROOT, "apps/platform/package.json"), "utf8"),
      readFile(path.join(REPOSITORY_ROOT, "apps/platform/vite.config.ts"), "utf8"),
    ]);
    const sources = await Promise.all(
      files.map(async (file) => ({ file, source: await readFile(file, "utf8") })),
    );
    const joined = sources.map(({ source }) => source).join("\n");

    expect(joined).not.toMatch(/(?:apps\/admin|@arclayer\/admin|@arclayer\/openapi)/);
    expect(packageJson).not.toMatch(/@arclayer\/(?:admin|openapi)/);
    expect(viteConfig).not.toMatch(/@arclayer\/(?:admin|openapi)/);
  });

  it("rejects compatibility facades and removed authority markers", async () => {
    const files = await platformSourceFiles();
    const sources = await Promise.all(
      files.map(async (file) => ({ file, source: await readFile(file, "utf8") })),
    );
    const relativePaths = (residues: readonly { file: string; source: string }[]) =>
      residues.map(({ file }) => path.relative(REPOSITORY_ROOT, file));

    expect(
      relativePaths(sources.filter(({ source }) => COMPATIBILITY_FACADE.test(source))),
    ).toEqual([]);
    expect(relativePaths(sources.filter(({ source }) => REMOVED_AUTHORITY.test(source)))).toEqual(
      [],
    );
    expect(
      relativePaths(sources.filter(({ source }) => ASSIGNABLE_WORKSPACE_OWNER_ROLE.test(source))),
    ).toEqual([]);
  });
});
