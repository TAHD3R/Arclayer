import type { CoreDocumentIR } from "@celestial/site-renderer-core";

import { getHardcodedDocument } from "./hardcoded-document";
import { resolveRouteFromApi } from "./site-api";

type ResolvedPublicRoute =
  | { kind: "page"; document: CoreDocumentIR }
  | { kind: "redirect"; to: string; status: 301 | 302 }
  | { kind: "not_found" };

type ResolvedHardcodedRoute = { kind: "page"; document: CoreDocumentIR } | { kind: "not_found" };

export type PortalResolveMode = "public" | "preview";

/**
 * Sprint 1/2: a deterministic, hardcoded route resolver.
 *
 * Why this exists:
 * - Validates the "route resolve -> document render" pipeline without any backend dependency.
 * - Provides a minimal playground for the future RouteTemplate resolver.
 *
 * Important:
 * - Must be deterministic between SSR and CSR (no Date.now(), no Math.random()).
 */
export function resolveHardcodedPublicRoute(pathnameRaw: string): ResolvedHardcodedRoute {
  const pathname = normalizePathname(pathnameRaw);

  if (pathname === "/") {
    return { kind: "page", document: getHardcodedDocument() };
  }

  if (pathname === "/about") {
    const base = getHardcodedDocument();
    const document: CoreDocumentIR = {
      ...base,
      meta: {
        title: { "zh-CN": "关于 Celestial", "en-US": "About Celestial" },
        description: {
          "zh-CN": "这是一个硬编码的 /about 页面，用于验证 CMS 路由解析。",
          "en-US": "A hardcoded /about page used to validate CMS-style route resolution.",
        },
      },
      blocks: [
        {
          id: "about",
          type: "container",
          props: { as: "section" },
          children: [
            {
              id: "about-h1",
              type: "heading",
              props: {
                level: 1,
                text: { "zh-CN": "关于（Hardcoded）", "en-US": "About (Hardcoded)" },
              },
            },
            {
              id: "about-p1",
              type: "paragraph",
              props: {
                text: {
                  "zh-CN":
                    "Sprint 1/2：我们在不接入后端的前提下，先验证「路径 -> DocumentIR」的解析能力。",
                  "en-US":
                    "Sprint 1/2: validate the 'pathname -> DocumentIR' resolution without backend integration.",
                },
              },
            },
          ],
        },
      ],
    };

    return { kind: "page", document };
  }

  // Minimal RouteTemplate simulation: /blog/:slug
  const blog = matchBlogRoute(pathname);
  if (blog) {
    const { slug } = blog;
    const base = getHardcodedDocument();
    const document: CoreDocumentIR = {
      ...base,
      meta: {
        title: { "zh-CN": `博客：${slug}`, "en-US": `Blog: ${slug}` },
        description: {
          "zh-CN": "这是一个硬编码的 RouteTemplate 示例（/blog/:slug）。",
          "en-US": "Hardcoded RouteTemplate example (/blog/:slug).",
        },
      },
      blocks: [
        {
          id: "blog",
          type: "container",
          props: { as: "article" },
          children: [
            {
              id: "blog-h1",
              type: "heading",
              props: {
                level: 1,
                text: { "zh-CN": `博客文章：${slug}`, "en-US": `Blog Post: ${slug}` },
              },
            },
            {
              id: "blog-p1",
              type: "paragraph",
              props: {
                text: {
                  "zh-CN":
                    "该页面目前完全硬编码，仅用于验证未来 RouteTemplate resolver 的整体管线形态。",
                  "en-US":
                    "This page is fully hardcoded and only exists to validate the future RouteTemplate resolver pipeline.",
                },
              },
            },
          ],
        },
      ],
    };
    return { kind: "page", document };
  }

  return { kind: "not_found" };
}

export async function resolvePortalRoute(
  pathnameRaw: string,
  args: { siteId: string; mode: PortalResolveMode; token?: string },
): Promise<ResolvedPublicRoute> {
  const pathname = normalizePathname(pathnameRaw);
  return await resolveRouteFromApi(pathname, args.siteId, { mode: args.mode, token: args.token });
}

function normalizePathname(pathnameRaw: string): string {
  const pathname = pathnameRaw.startsWith("/") ? pathnameRaw : `/${pathnameRaw}`;
  if (pathname === "/") return "/";
  // Normalize trailing slash for deterministic matching.
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function matchBlogRoute(pathname: string): { slug: string } | null {
  // /blog/:slug
  if (!pathname.startsWith("/blog/")) return null;
  const slug = pathname.slice("/blog/".length);
  if (!slug) return null;
  if (slug.includes("/")) return null;
  return { slug };
}
