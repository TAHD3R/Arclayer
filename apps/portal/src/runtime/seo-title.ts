import type { TitlePolicyV1 } from "@celestial/internal-types";

export function resolvePortalTitle(args: {
  policy: TitlePolicyV1 | undefined;
  pathnameNoLocale: string;
  pageSeoTitle?: string | undefined;
  pageMetaTitle?: string | undefined;
  defaultTitle?: string | undefined;
  siteName?: string | undefined;
  siteSubtitle?: string | undefined;
  siteTitleFallback?: string | undefined;
}): string | undefined {
  const pageTitleForPolicy =
    (args.pageSeoTitle ?? "").trim() ||
    (args.pageMetaTitle ?? "").trim() ||
    (args.defaultTitle ?? "").trim() ||
    undefined;

  const titleFromPolicy = composeTitleFromPolicyV1({
    policy: args.policy,
    pathnameNoLocale: args.pathnameNoLocale,
    pageTitle: pageTitleForPolicy,
    siteName: args.siteName,
    siteSubtitle: args.siteSubtitle,
  });

  return (
    titleFromPolicy ||
    pageTitleForPolicy ||
    (args.defaultTitle ?? "").trim() ||
    (args.siteTitleFallback ?? "").trim() ||
    undefined
  );
}

export function composeTitleFromPolicyV1(args: {
  policy: TitlePolicyV1 | undefined;
  pathnameNoLocale: string;
  pageTitle: string | undefined;
  siteName: string | undefined;
  siteSubtitle: string | undefined;
}): string | undefined {
  const policy = args.policy;
  if (!policy || !Array.isArray(policy.parts) || policy.parts.length === 0) return undefined;

  const pathnameNoLocale = (args.pathnameNoLocale || "/").trim() || "/";
  const isHome = pathnameNoLocale === "/";

  const siteName = (args.siteName || "").trim();
  const siteSubtitle = (args.siteSubtitle || "").trim();
  const dedupe = policy.dedupe !== false;
  const homeMode = policy.homeMode ?? "siteOnly";

  let pageTitle = (args.pageTitle || "").trim();
  if (dedupe && siteName && pageTitle && pageTitle === siteName) {
    pageTitle = "";
  }

  if (isHome && homeMode === "siteOnly") {
    return siteName || pageTitle || undefined;
  }

  const tokenValues: Record<"pageTitle" | "siteName" | "siteSubtitle", string> = {
    pageTitle,
    siteName,
    siteSubtitle,
  };

  const pieces: string[] = [];
  for (const part of policy.parts) {
    if (part.kind === "literal") {
      pieces.push(String(part.value || ""));
      continue;
    }
    if (part.kind === "token") {
      const v = tokenValues[part.value] || "";
      if (!v.trim()) continue;
      pieces.push(v);
    }
  }

  const raw = pieces.join("");
  const cleaned = cleanupTitle(raw);
  return cleaned || undefined;
}

export function cleanupTitle(input: string): string {
  let s = String(input || "")
    .replaceAll(/\s+/g, " ")
    .trim();
  if (!s) return "";

  // Drop leading/trailing separators that often appear when a token is missing.
  const sep = /^(?:[-–—|·•:]+|\s+)+|(?:[-–—|·•:]+|\s+)+$/g;
  s = s.replace(sep, "").trim();
  return s;
}
