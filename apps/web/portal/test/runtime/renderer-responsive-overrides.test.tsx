import React from "react";
import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { DocumentRenderer } from "@celestial/site-renderer-core";
import type { CoreDocumentIR } from "@celestial/site-renderer-core";
import type { ViewerContext } from "@celestial/site-block-protocol";

describe("site-renderer-core responsive overrides", () => {
  test("applies node.responsive visual overrides for ctx.breakpoint", () => {
    const doc: CoreDocumentIR = {
      version: 1,
      blocks: [
        {
          id: "c-root",
          type: "container",
          props: {
            as: "section",
            layout: { padding: 12 },
            style: { backgroundColor: "#111111" },
          },
          responsive: {
            mobile: {
              style: { backgroundColor: "#123456" },
            },
          },
          children: [],
        },
      ],
    };

    const ctx: ViewerContext = {
      locale: "en-US",
      breakpoint: "mobile",
    };

    const html = renderToStaticMarkup(<DocumentRenderer document={doc} ctx={ctx} />);
    expect(html).toContain("background-color:#123456");
  });
});
