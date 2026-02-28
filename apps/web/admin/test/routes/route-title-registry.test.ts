import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

function resolveTitleKey(staticData: unknown): string | null {
  if (!staticData || typeof staticData !== "object") return null;
  const value = (staticData as Record<string, unknown>).titleKey;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function getChildren(route: unknown): unknown[] {
  if (!route || typeof route !== "object") return [];
  const children = (route as Record<string, unknown>).children;
  return Array.isArray(children) ? children : [];
}

function getRouteId(route: unknown): string {
  if (!route || typeof route !== "object") return "<unknown>";
  const id = (route as Record<string, unknown>).id;
  return typeof id === "string" && id.trim() ? id : "<unknown>";
}

function isLazyRoute(route: unknown): boolean {
  if (!route || typeof route !== "object") return false;
  return typeof (route as Record<string, unknown>).lazyFn === "function";
}

function isComponentRoute(route: unknown): boolean {
  if (!route || typeof route !== "object") return false;
  const options = (route as Record<string, unknown>).options;
  if (!options || typeof options !== "object") return false;
  return typeof (options as Record<string, unknown>).component === "function";
}

function getStaticData(route: unknown): unknown {
  if (!route || typeof route !== "object") return undefined;
  const options = (route as Record<string, unknown>).options;
  if (!options || typeof options !== "object") return undefined;
  return (options as Record<string, unknown>).staticData;
}

describe("Route Title Registry", () => {
  it("每个页面路由都必须声明 staticData.titleKey", () => {
    const missing: string[] = [];
    const stack: unknown[] = [routeTree];

    while (stack.length) {
      const current = stack.pop();
      if (!current) continue;

      const children = getChildren(current);
      for (const child of children) stack.push(child);

      const isLeaf = children.length === 0;
      if (!isLeaf) continue;

      // Page route heuristic:
      // - Leaf + (lazy route OR direct component) => must have a titleKey.
      // Redirect-only routes are leaf but have neither lazyFn nor component.
      if (!isLazyRoute(current) && !isComponentRoute(current)) continue;

      const titleKey = resolveTitleKey(getStaticData(current));
      if (!titleKey) missing.push(getRouteId(current));
    }

    expect(missing, `Missing staticData.titleKey for page routes:\n${missing.join("\n")}`).toEqual(
      [],
    );
  });
});
