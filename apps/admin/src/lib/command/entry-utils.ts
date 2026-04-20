import { File, LayoutTemplate, UserRound } from "lucide-react";

import type { AdminAssetSummary } from "@/types/api";
import type { CommandEntry, RecentCommandRecord } from "@/lib/command/command-types";

const WHITESPACE = /\s+/g;

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase().replace(WHITESPACE, " ");
}

export function matchesCommandEntry(entry: CommandEntry, query: string): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;

  const tokens = normalizedQuery.split(" ").filter(Boolean);
  const haystack = normalizeSearchText(
    [entry.title, entry.subtitle, entry.meta, ...entry.keywords].filter(Boolean).join(" "),
  );

  return tokens.every((token) => haystack.includes(token));
}

export function buildNotificationsPath(_workspaceId: string | null): string {
  return "/notifications/";
}

export function formatAssetCommandTitle(asset: AdminAssetSummary): string {
  const originalFilename = String(asset.originalFilename || "").trim();
  if (originalFilename) return originalFilename;

  const title = String(asset.title || "").trim();
  if (title) return title;

  const slug = String(asset.slug || "").trim();
  const ext = String(asset.ext || "").trim();
  if (slug && ext) return `${slug}.${ext}`;

  return asset.id;
}

export function formatAssetBytes(bytes: number | undefined | null): string | null {
  if (typeof bytes !== "number" || bytes < 0) return null;
  const units = ["B", "KB", "MB", "GB"] as const;
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  const number = index === 0 ? String(Math.round(value)) : value.toFixed(value < 10 ? 1 : 0);
  return `${number} ${units[index]}`;
}

function buildRecentFallbackEntry(record: RecentCommandRecord): CommandEntry {
  const icon = record.kind === "user" ? UserRound : record.kind === "page" ? LayoutTemplate : File;

  return {
    id: `recent:${record.key}`,
    key: record.key,
    kind: record.kind,
    title: record.title,
    subtitle: record.subtitle,
    keywords: record.keywords,
    icon,
    avatar: record.avatarName
      ? {
          name: record.avatarName,
          assetRef: record.avatarAssetRef,
          shape: record.avatarShape,
        }
      : undefined,
    shortcut: record.shortcut,
    action: record.settingsTarget
      ? { type: "settings" as const, target: record.settingsTarget }
      : { type: "navigate" as const, to: record.to, search: record.search },
    recent: {
      enabled: true,
      snapshot: {
        key: record.key,
        kind: record.kind,
        title: record.title,
        subtitle: record.subtitle,
        keywords: record.keywords,
        to: record.to,
        search: record.search,
        settingsTarget: record.settingsTarget,
        avatarName: record.avatarName,
        avatarAssetRef: record.avatarAssetRef,
        avatarShape: record.avatarShape,
        shortcut: record.shortcut,
      },
    },
  };
}

export function resolveRecentCommandEntries(
  records: readonly RecentCommandRecord[],
  pageEntries: readonly CommandEntry[],
): CommandEntry[] {
  const pageEntryByPath = new Map<string, CommandEntry>();

  for (const entry of pageEntries) {
    if (entry.action.type !== "navigate") continue;
    pageEntryByPath.set(entry.action.to, entry);
  }

  return records.map((record) => {
    if (record.kind === "page") {
      const live = pageEntryByPath.get(record.to);
      if (live) return live;
    }
    return buildRecentFallbackEntry(record);
  });
}
