import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const thisFile = fileURLToPath(import.meta.url);
const thisDir = dirname(thisFile);

function resolveSource(relativePath: string) {
  return resolve(thisDir, "../../src", relativePath);
}

describe("workspace content and theme routes", () => {
  test("workspace content pages route uses placeholder view", () => {
    const contentPagesRoute = readFileSync(
      resolveSource("routes/w/$workspaceId/content/pages/index.tsx"),
      "utf-8",
    );

    expect(contentPagesRoute).toContain(
      "import { PlaceholderView } from \"@/pages/placeholder/page\"",
    );
    expect(contentPagesRoute).toContain("titleKey=\"nav:NAV_CONTENT_PAGES\"");
    expect(contentPagesRoute).not.toContain("ContentPagesIndexView");
  });

  test("workspace themes route uses placeholder view", () => {
    const themesRoute = readFileSync(
      resolveSource("routes/w/$workspaceId/appearance/themes/index.tsx"),
      "utf-8",
    );

    expect(themesRoute).toContain(
      "import { PlaceholderView } from \"@/pages/placeholder/page\"",
    );
    expect(themesRoute).toContain("titleKey=\"nav:NAV_APPEARANCE_THEMES\"");
    expect(themesRoute).not.toContain("WorkspaceThemesView");
  });

  test("workspace content edit route file is removed", () => {
    const editRouteFile = resolveSource("routes/w/$workspaceId/content/pages/$pageId/edit.tsx");

    expect(existsSync(editRouteFile)).toBe(false);
  });

  test("legacy workspace content and themes pages are removed", () => {
    const contentIndexViewFile = resolveSource("pages/workspaces/content/pages/page.tsx");
    const contentEditorViewFile = resolveSource("pages/workspaces/content/pages/editor.tsx");
    const themesViewFile = resolveSource("pages/workspaces/appearance/themes/page.tsx");

    expect(existsSync(contentIndexViewFile)).toBe(false);
    expect(existsSync(contentEditorViewFile)).toBe(false);
    expect(existsSync(themesViewFile)).toBe(false);
  });
});
