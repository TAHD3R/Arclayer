import { describe, expect, test } from "vitest";

import { resolveRefState } from "../src/internal/design/resolve-ref-state";

describe("site-renderer-core: resolveRefState", () => {
  test("auto resolves to draft in preview", () => {
    expect(resolveRefState("auto", "preview")).toBe("draft");
  });

  test("auto resolves to published in public", () => {
    expect(resolveRefState("auto", "public")).toBe("published");
  });

  test("draft resolves to published in public (key alignment)", () => {
    expect(resolveRefState("draft", "public")).toBe("published");
  });
});
