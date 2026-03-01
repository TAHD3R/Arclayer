import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { PageBlueprintRenderer } from "@celestial/site-renderer-core";
import type { DesignRenderDataSourcesV1 } from "@celestial/site-renderer-core";
import type { PageBlueprint, ViewerContext } from "@celestial/site-block-protocol";

describe("binding: primaryEntry (SSR)", () => {
  test("text binding resolves from dataSources.primaryEntry.data.fields", () => {
    const doc: PageBlueprint = {
      version: 1,
      rootId: "page",
      nodesById: {
        page: {
          id: "page",
          type: "page_root",
          children: ["title"],
          layout: { children: { mode: "absolute" } },
        },
        title: {
          id: "title",
          type: "text",
          name: "Title",
          tag: "h1",
          text: { kind: "binding", source: "primaryEntry", path: "fields.title" },
          layout: {
            self: {
              rect: { x: 0, y: 0, width: 720, height: 0 },
              constraints: { horizontal: "left", vertical: "top" },
              alignX: "start",
              alignY: "start",
            },
            children: { mode: "absolute" },
          },
        },
      },
    };

    const viewerCtx: ViewerContext = {
      locale: "en-US",
      fallbackLocale: "zh-CN",
      routeParams: {},
      variantId: null,
      mode: "light",
      breakpoint: "desktop",
    };

    const dataSources: DesignRenderDataSourcesV1 = {
      primaryEntry: {
        id: "entry_1",
        data: { fields: { title: "Hello Binding" } },
      },
      routeParams: {},
      viewer: { locale: "en-US", breakpoint: "desktop", mode: "light" },
    };

    const html = renderToString(
      <PageBlueprintRenderer
        document={doc}
        ctx={viewerCtx}
        viewport={{ width: 1440, height: 800, baseWidth: 1440, baseHeight: 800 }}
        dataSources={dataSources}
      />,
    );

    expect(html).toContain("Hello Binding");
  });
});
