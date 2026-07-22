import { describe, expect, it } from "vitest";

import {
  buildProjectEditorHref,
  parseProjectEditorSearch,
} from "@/pages/projects/editor/editor-deep-link";

describe("project editor deep links", () => {
  it("parses supported stages and a trimmed page authority", () => {
    expect(
      parseProjectEditorSearch({
        stage: "wireframe",
        page: " home-page ",
        target: ["page:home-page", "global_section:global-header"],
      }),
    ).toEqual({
      stage: "wireframe",
      page: "home-page",
      target: ["page:home-page", "global_section:global-header"],
    });
  });

  it("defaults unknown stages to Sitemap without inventing a page", () => {
    expect(parseProjectEditorSearch({ stage: "unknown", page: " " })).toEqual({
      stage: "sitemap",
    });
  });

  it("builds an encoded link to the exact project stage and page", () => {
    expect(
      buildProjectEditorHref("project/one", {
        stage: "wireframe",
        page: "home page",
        targets: [
          { kind: "page", itemId: "home page" },
          { kind: "global_section", itemId: "navigation/global" },
        ],
      }),
    ).toBe(
      "/projects/project%2Fone/editor?stage=wireframe&page=home+page&target=page%3Ahome+page&target=global_section%3Anavigation%2Fglobal",
    );
  });
});
