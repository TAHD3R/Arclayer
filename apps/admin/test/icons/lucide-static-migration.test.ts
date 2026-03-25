import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../../../..");
const adminRoot = path.join(repoRoot, "apps/admin/src");
const uiRoot = path.join(repoRoot, "packages/ui/shadcn/src");
const uiPackageJsonPath = path.join(repoRoot, "packages/ui/shadcn/package.json");

function collectFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectFiles(fullPath);
    if (!entry.name.match(/\.(ts|tsx)$/)) return [];
    return [fullPath];
  });
}

describe("lucide static migration", () => {
  it("shared ui package no longer exports the animated lucide barrel", () => {
    const packageJson = JSON.parse(fs.readFileSync(uiPackageJsonPath, "utf8")) as {
      exports?: Record<string, string>;
    };

    expect(packageJson.exports).not.toHaveProperty("./icons/lucide-animated");
  });

  it("admin and shared ui source files no longer import the animated lucide barrel", () => {
    const sourceFiles = [...collectFiles(adminRoot), ...collectFiles(uiRoot)];

    for (const filePath of sourceFiles) {
      const source = fs.readFileSync(filePath, "utf8");
      expect(source, path.relative(repoRoot, filePath)).not.toMatch(
        /@arclayer\/ui\/icons\/lucide-animated/,
      );
    }
  });
});
