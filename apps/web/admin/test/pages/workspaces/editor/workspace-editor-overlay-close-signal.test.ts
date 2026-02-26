import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const thisFile = fileURLToPath(import.meta.url);
const thisDir = dirname(thisFile);

function resolveSource(relativePath: string) {
  return resolve(thisDir, "../../../../src", relativePath);
}

describe("workspace editor overlay close signal", () => {
  test("popover/panel close effects only respond to signal changes (avoid open->close loop)", () => {
    const canvasToolbar = readFileSync(
      resolveSource("pages/workspaces/editor/components/canvas-toolbar.tsx"),
      "utf-8",
    );
    const pageSwitcher = readFileSync(
      resolveSource("pages/workspaces/editor/components/editor-page-switcher.tsx"),
      "utf-8",
    );
    const header = readFileSync(
      resolveSource("pages/workspaces/editor/components/editor-header.tsx"),
      "utf-8",
    );

    // Guard should exist to prevent "open -> immediately close" on mount/state changes.
    expect(canvasToolbar).toContain("lastOverlayCloseSignalRef");
    expect(canvasToolbar).toContain(
      "if (overlayCloseSignal === lastOverlayCloseSignalRef.current) return;",
    );

    expect(pageSwitcher).toContain("lastSignalRef");
    expect(pageSwitcher).toContain("if (signal === lastSignalRef.current) return;");

    expect(header).toContain("lastSignalRef");
    expect(header).toContain("if (signal === lastSignalRef.current) return;");
  });
});
