import { describe, expect, it, vi } from "vitest";

vi.mock("@/constants/app-config", () => ({
  getAppConfig: () => ({ title: "Celestial", apiBaseUrl: "", apiPrefix: "" }),
}));

import {
  buildDocumentTitle,
  collectAllowedWorkspacePathPrefixes,
  findActiveTrailNodes,
  isExactMatch,
  isPrefixMatch,
  normalizePath,
} from "@/lib/admin-nav-utils";
import type { AdminNavItem } from "@/constants/menu/workspaces";

// ---------------------------------------------------------------------------
// normalizePath
// ---------------------------------------------------------------------------

describe("normalizePath", () => {
  it("strips trailing slash from multi-char paths", () => {
    expect(normalizePath("/foo/")).toBe("/foo");
  });

  it("preserves root slash", () => {
    expect(normalizePath("/")).toBe("/");
  });

  it("returns path unchanged when no trailing slash", () => {
    expect(normalizePath("/foo/bar")).toBe("/foo/bar");
  });
});

// ---------------------------------------------------------------------------
// isExactMatch / isPrefixMatch
// ---------------------------------------------------------------------------

describe("isExactMatch", () => {
  it("matches identical paths", () => {
    expect(isExactMatch("/foo", "/foo")).toBe(true);
  });

  it("ignores trailing slash difference", () => {
    expect(isExactMatch("/foo/", "/foo")).toBe(true);
  });

  it("rejects different paths", () => {
    expect(isExactMatch("/foo", "/bar")).toBe(false);
  });
});

describe("isPrefixMatch", () => {
  it("matches exact path", () => {
    expect(isPrefixMatch("/foo", "/foo")).toBe(true);
  });

  it("matches child path", () => {
    expect(isPrefixMatch("/foo", "/foo/bar")).toBe(true);
  });

  it("rejects partial segment match", () => {
    expect(isPrefixMatch("/foo", "/foobar")).toBe(false);
  });

  it("root only matches root", () => {
    expect(isPrefixMatch("/", "/")).toBe(true);
    expect(isPrefixMatch("/", "/foo")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// findActiveTrailNodes
// ---------------------------------------------------------------------------

const makeItem = (key: string, to?: string, children?: AdminNavItem[]): AdminNavItem => ({
  key,
  label: key,
  icon: {} as AdminNavItem["icon"],
  disabled: false,
  blockedReason: null,
  requiredPermission: null,
  ownerPluginId: null,
  ...(to ? { to } : {}),
  ...(children?.length ? { children } : {}),
});

describe("findActiveTrailNodes", () => {
  const items: AdminNavItem[] = [
    makeItem("dashboard", "/w/1/"),
    makeItem("content", "/w/1/content", [
      makeItem("site-builder", "/w/1/content/site-builder"),
      makeItem("library", "/w/1/content/library"),
    ]),
  ];

  it("returns exact match trail", () => {
    const trail = findActiveTrailNodes(items, "/w/1/content/site-builder");
    expect(trail.map((n) => n.key)).toEqual(["content", "site-builder"]);
  });

  it("prefers exact match over prefix", () => {
    const trail = findActiveTrailNodes(items, "/w/1/");
    expect(trail.map((n) => n.key)).toEqual(["dashboard"]);
  });

  it("returns empty for unmatched path", () => {
    expect(findActiveTrailNodes(items, "/unknown")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildDocumentTitle
// ---------------------------------------------------------------------------

describe("buildDocumentTitle", () => {
  it("returns brand only when both args are null", () => {
    expect(buildDocumentTitle(null, null)).toBe("Celestial");
  });

  it("returns routeTitle | brand when no workspace", () => {
    expect(buildDocumentTitle("Dashboard", null)).toBe("Dashboard | Celestial");
  });

  it("appends brand to workspace name", () => {
    expect(buildDocumentTitle(null, "My Site")).toBe("My Site Celestial");
  });

  it("skips brand suffix when workspace name already contains it", () => {
    expect(buildDocumentTitle(null, "Celestial Demo")).toBe("Celestial Demo");
  });

  it("combines routeTitle, workspace, and brand", () => {
    expect(buildDocumentTitle("Pages", "My Site")).toBe("Pages | My Site Celestial");
  });
});

// ---------------------------------------------------------------------------
// collectAllowedWorkspacePathPrefixes
// ---------------------------------------------------------------------------

describe("collectAllowedWorkspacePathPrefixes", () => {
  it("always includes base, notifications, and settings", () => {
    const result = collectAllowedWorkspacePathPrefixes([], "/w/1");
    expect(result).toContain("/w/1");
    expect(result).toContain("/w/1/notifications");
    expect(result).toContain("/w/1/settings");
  });

  it("includes enabled nav item paths", () => {
    const items: AdminNavItem[] = [makeItem("site-builder", "/w/1/content/site-builder")];
    const result = collectAllowedWorkspacePathPrefixes(items, "/w/1");
    expect(result).toContain("/w/1/content/site-builder");
  });

  it("excludes disabled nav item paths", () => {
    const items: AdminNavItem[] = [
      { ...makeItem("site-builder", "/w/1/content/site-builder"), disabled: true },
    ];
    const result = collectAllowedWorkspacePathPrefixes(items, "/w/1");
    expect(result).not.toContain("/w/1/content/site-builder");
  });

  it("adds team alias when team children exist", () => {
    const items: AdminNavItem[] = [makeItem("members", "/w/1/team/members")];
    const result = collectAllowedWorkspacePathPrefixes(items, "/w/1");
    expect(result).toContain("/w/1/team");
  });
});
