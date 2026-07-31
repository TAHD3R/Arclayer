import {
  BadgeInfo,
  Bell,
  BookOpenText,
  Boxes,
  ChartNoAxesCombined,
  ChartPie,
  CircleUserRound,
  FolderOpen,
  Globe2,
  History,
  LayoutDashboard,
  LibraryBig,
  MailPlus,
  MonitorCog,
  Paintbrush,
  PanelsTopLeft,
  ScanSearch,
  SearchCheck,
  Settings2,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { describe, expect, it } from "vitest";

import { PROJECT_NAV_ITEMS } from "@/constants/menu/project";
import { resolveProjectSceneNavItems } from "@/constants/menu/project-scene";
import { SETTINGS_NAV_ITEMS } from "@/constants/menu/settings";
import type { AdminNavItem } from "@/types/admin-nav";

function flattenNavItems(items: readonly AdminNavItem[]): AdminNavItem[] {
  return items.flatMap((item) => [item, ...flattenNavItems(item.children ?? [])]);
}

const PROJECT_MENU_ICONS = new Map([
  ["dashboard", LayoutDashboard],
  ["editor", PanelsTopLeft],
  ["assets", FolderOpen],
  ["website.domains", Globe2],
  ["content", BookOpenText],
  ["content.library", LibraryBig],
  ["content.models", Boxes],
  ["seo", ScanSearch],
  ["seo.google-analytics", ChartNoAxesCombined],
  ["seo.audit", SearchCheck],
  ["website.config", MonitorCog],
  ["activity", History],
  ["settings.project", Settings2],
] as const);

const SETTINGS_MENU_ICONS = new Map([
  ["settings.personal.profile", CircleUserRound],
  ["settings.personal.preferences", Paintbrush],
  ["settings.personal.notifications", Bell],
  ["settings.workspace.general", BadgeInfo],
  ["settings.workspace.plan-usage", ChartPie],
  ["settings.workspace.members", UsersRound],
  ["settings.workspace.invitations", MailPlus],
  ["settings.workspace.roles", ShieldCheck],
] as const);

function expectMenuIcons(items: readonly AdminNavItem[], icons: ReadonlyMap<string, unknown>) {
  const flattenedItems = flattenNavItems(items);

  expect(flattenedItems.map((item) => item.key)).toEqual([...icons.keys()]);
  for (const item of flattenedItems) {
    expect(item.icon, item.key).toBe(icons.get(item.key));
  }
}

describe("menu icon semantics", () => {
  it("assigns a distinct product icon to every project menu item", () => {
    expectMenuIcons(PROJECT_NAV_ITEMS, PROJECT_MENU_ICONS);
  });

  it("preserves project icons after resolving scene routes", () => {
    expectMenuIcons(resolveProjectSceneNavItems("project-alpha"), PROJECT_MENU_ICONS);
  });

  it("assigns a product-specific icon to every settings menu item", () => {
    expectMenuIcons(SETTINGS_NAV_ITEMS, SETTINGS_MENU_ICONS);
  });
});
