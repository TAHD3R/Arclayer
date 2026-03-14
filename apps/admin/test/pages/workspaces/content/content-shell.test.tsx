import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

function resolveSource(relativePath: string) {
  return path.resolve(process.cwd(), "src", relativePath);
}

describe("workspace content shared shell", () => {
  test("content views share a dedicated shell component", () => {
    const shellFile = resolveSource("pages/workspaces/content/shared/content-shell.tsx");
    expect(existsSync(shellFile)).toBe(true);

    const shellSource = readFileSync(shellFile, "utf8");
    expect(shellSource).toContain("DefaultPage");
    expect(shellSource).not.toContain("@/api/workspace-site");

    const viewFiles = [
      "pages/workspaces/content/models/components/content-models-view.tsx",
      "pages/workspaces/content/library/components/content-library-view.tsx",
      "pages/workspaces/content/site-builder/components/site-builder-view.tsx",
    ];

    for (const relativePath of viewFiles) {
      const source = readFileSync(resolveSource(relativePath), "utf8");
      expect(source).toContain("@/pages/workspaces/content/shared/content-shell");
      expect(source).not.toContain('from "@/components/common/default-page"');
    }
  });
});
