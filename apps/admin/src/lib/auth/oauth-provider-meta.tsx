import type { ReactNode } from "react";
import { CircleEllipsisIcon, MessageCircleIcon, PanelsTopLeftIcon } from "lucide-react";

import GitHubDarkIcon from "@arclayer/ui/icons/github-dark-icon";
import GitHubLightIcon from "@arclayer/ui/icons/github-light-icon";
import GoogleIcon from "@arclayer/ui/icons/google-icon";

export type OAuthProviderMetaInput = {
  provider: string;
  label?: string;
  startUrl?: string;
  start_url?: string;
};

export type OAuthProviderMeta = {
  provider: string;
  title: string;
  fullLabel: string;
  shortLabel: string;
  startUrl: string;
  icon: ReactNode;
};

export function normalizeOAuthProvider(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function titleizeProvider(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function resolveOAuthProviderMeta(input: {
  provider: OAuthProviderMetaInput;
  t: (key: string, options?: Record<string, unknown>) => string;
  isDark: boolean;
}): OAuthProviderMeta {
  const normalized = normalizeOAuthProvider(input.provider.provider);
  const fallbackLabel = input.provider.label?.trim() || titleizeProvider(normalized);
  const startUrl = String(input.provider.startUrl || input.provider.start_url || "");

  if (normalized === "google") {
    return {
      provider: normalized,
      title: input.t("auth:OAUTH_GOOGLE_TITLE"),
      fullLabel: input.t("auth:OAUTH_GOOGLE"),
      shortLabel: "Google",
      startUrl,
      icon: <GoogleIcon size={14} />,
    };
  }

  if (normalized === "github") {
    const GitHubIcon = input.isDark ? GitHubDarkIcon : GitHubLightIcon;
    return {
      provider: normalized,
      title: input.t("auth:OAUTH_GITHUB_TITLE"),
      fullLabel: input.t("auth:OAUTH_GITHUB"),
      shortLabel: "GitHub",
      startUrl,
      icon: <GitHubIcon size={14} />,
    };
  }

  if (normalized === "microsoft") {
    return {
      provider: normalized,
      title: input.t("auth:OAUTH_MICROSOFT_TITLE"),
      fullLabel: input.t("auth:OAUTH_MICROSOFT"),
      shortLabel: "Microsoft",
      startUrl,
      icon: <PanelsTopLeftIcon size={14} />,
    };
  }

  if (normalized === "discord") {
    return {
      provider: normalized,
      title: input.t("auth:OAUTH_DISCORD_TITLE"),
      fullLabel: input.t("auth:OAUTH_DISCORD"),
      shortLabel: "Discord",
      startUrl,
      icon: <MessageCircleIcon size={14} />,
    };
  }

  return {
    provider: normalized,
    title: fallbackLabel,
    fullLabel: fallbackLabel,
    shortLabel: fallbackLabel,
    startUrl,
    icon: <CircleEllipsisIcon size={14} />,
  };
}
