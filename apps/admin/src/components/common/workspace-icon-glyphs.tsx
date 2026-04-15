import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  BadgeDollarSign,
  Brain,
  Crown,
  Flame,
  Flag,
  Folder,
  Gem,
  Globe,
  Heart,
  House,
  MessageCircle,
  Rocket,
  Settings2,
  Sun,
  User,
  Users,
  Wrench,
  Zap,
} from "lucide-react";

export const WORKSPACE_ICON_GLYPH_IDS = [
  "rocket",
  "zap",
  "brain",
  "message-circle",
  "settings-2",
  "crown",
  "gem",
  "badge-dollar-sign",
  "flag",
  "flame",
  "folder",
  "globe",
  "heart",
  "house",
  "user",
  "badge-check",
  "sun",
  "wrench",
  "users",
] as const;

export type WorkspaceIconGlyphId = (typeof WORKSPACE_ICON_GLYPH_IDS)[number];

export const WORKSPACE_ICON_GLYPHS = {
  rocket: Rocket,
  zap: Zap,
  brain: Brain,
  "message-circle": MessageCircle,
  "settings-2": Settings2,
  crown: Crown,
  gem: Gem,
  "badge-dollar-sign": BadgeDollarSign,
  flag: Flag,
  flame: Flame,
  folder: Folder,
  globe: Globe,
  heart: Heart,
  house: House,
  user: User,
  "badge-check": BadgeCheck,
  sun: Sun,
  wrench: Wrench,
  users: Users,
} as const satisfies Record<WorkspaceIconGlyphId, LucideIcon>;

export function getWorkspaceGlyphIcon(glyph?: string | null): LucideIcon | null {
  if (!glyph) return null;

  return WORKSPACE_ICON_GLYPHS[glyph as WorkspaceIconGlyphId] ?? null;
}
