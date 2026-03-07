import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { PortalRuntimeConfig, PortalRouteMatch } from "@celestial/internal-types";
import type { PageBlueprint, ViewerContext } from "@celestial/block-protocol";

import { PortalDocumentPage } from "@/views/portal-document-page";

describe("binding: site runtime (SSR)", () => {
  test("text binding resolves from runtimeConfig-backed site data", () => {
    const document: PageBlueprint = {
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
          text: { kind: "binding", source: "site", path: "seoDefaultTitle" },
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
      mode: "public",
      breakpoint: "desktop",
    };

    const match: PortalRouteMatch = {
      kind: "page",
      pageId: "page-home",
      path: "/",
      params: {},
      variantId: null,
      revisionState: "published",
      draftRevision: 3,
      publishedRevision: 2,
    };

    const runtimeConfig: PortalRuntimeConfig = {
      theme: { cssVars: { "--color-primary": "#1677ff" } },
      site: {
        name: "Celestial",
      },
      seo: {
        defaultTitle: "Runtime SEO Title",
      },
      siteLocalization: {
        locale: "en-US",
        defaultLocale: "en-US",
        fallbackLocale: "zh-CN",
      },
    };

    const html = renderToString(
      <PortalDocumentPage
        document={document}
        match={match}
        viewerCtx={viewerCtx}
        runtimeConfig={runtimeConfig}
      />,
    );

    expect(html).toContain("Runtime SEO Title");
  });
});
