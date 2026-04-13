import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CircleEllipsisIcon } from "lucide-react";

import { listSSOProviders } from "@/api/auth-sso";
import { notifyErrorText } from "@/lib/notifications";
import { usePreferencesStore } from "@/stores/use-preference-store";
import type { AuthSSOProvider } from "@/types/api";
import { Button } from "@arclayer/ui/button";
import GitHubDarkIcon from "@arclayer/ui/icons/github-dark-icon";
import GitHubLightIcon from "@arclayer/ui/icons/github-light-icon";
import GoogleIcon from "@arclayer/ui/icons/google-icon";
import { Separator } from "@arclayer/ui/separator";
import { cn } from "@arclayer/lib/utils";

export interface AuthOauthButtonsProps {
  disabled?: boolean;
  redirect?: string | undefined;
  leadingActions?: Array<{
    key: string;
    label: string;
    shortLabel?: string;
    icon?: ReactNode;
    onClick: () => void;
  }>;
}

function normalizeProvider(value: unknown): string {
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

function resolveProviderMeta(
  provider: AuthSSOProvider,
  t: (key: string) => string,
  isDark: boolean,
) {
  const normalized = normalizeProvider(provider.provider);
  const fallbackLabel = provider.label?.trim() || titleizeProvider(normalized);

  if (normalized === "google") {
    return {
      provider: normalized,
      fullLabel: t("auth:OAUTH_GOOGLE"),
      shortLabel: "Google",
      startUrl: String(provider.startUrl || provider.start_url || ""),
      icon: <GoogleIcon size={14} />,
    };
  }

  if (normalized === "github") {
    const GitHubIcon = isDark ? GitHubDarkIcon : GitHubLightIcon;
    return {
      provider: normalized,
      fullLabel: t("auth:OAUTH_GITHUB"),
      shortLabel: "GitHub",
      startUrl: String(provider.startUrl || provider.start_url || ""),
      icon: <GitHubIcon size={14} />,
    };
  }

  return {
    provider: normalized,
    fullLabel: fallbackLabel,
    shortLabel: fallbackLabel,
    startUrl: String(provider.startUrl || provider.start_url || ""),
    icon: <CircleEllipsisIcon size={14} />,
  };
}

export function AuthOauthButtons({
  disabled = false,
  redirect,
  leadingActions = [],
}: AuthOauthButtonsProps) {
  const { t } = useTranslation();
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const isDark = themeMode === "dark";

  const providersQuery = useQuery({
    queryKey: ["auth", "sso", "providers", redirect],
    queryFn: async () => listSSOProviders({ redirect }),
    staleTime: 15 * 1000,
    retry: false,
  });

  const providers = (providersQuery.data?.providers ?? []).map((provider) =>
    resolveProviderMeta(provider, t, isDark),
  );
  const actions = [
    ...leadingActions.map((action) => ({
      key: action.key,
      fullLabel: action.label,
      shortLabel: action.shortLabel ?? action.label,
      icon: action.icon,
      onClick: action.onClick,
    })),
    ...providers.map((provider) => ({
      key: provider.provider,
      fullLabel: provider.fullLabel,
      shortLabel: provider.shortLabel,
      icon: provider.icon,
      onClick: () => {
        if (!provider.startUrl) {
          notifyErrorText(t("auth:OAUTH_ERROR_GENERIC"));
          return;
        }
        window.location.assign(provider.startUrl);
      },
    })),
  ];
  if (actions.length === 0) return null;

  const isBusy = disabled || providersQuery.isLoading;
  const isSingleProvider = actions.length === 1;

  return (
    <div className="grid gap-2.5">
      <div className="flex items-center gap-3 py-1 text-footnote text-label-secondary">
        <Separator className="flex-1" />
        <span className="shrink-0">{t("auth:OAUTH_ACCOUNT_DIVIDER")}</span>
        <Separator className="flex-1" />
      </div>
      <div
        className={cn(
          isSingleProvider
            ? "grid grid-cols-1 gap-2.5"
            : "flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        )}
      >
        {actions.map((action) => (
          <Button
            key={action.key}
            className={cn(
              "rounded-md border-border/80 bg-card/80  transition-colors hover:bg-accent/35",
              isSingleProvider
                ? "h-10 w-full justify-center px-4"
                : "h-10 min-w-30 flex-1 justify-center px-3 text-footnote sm:min-w-0",
            )}
            variant="outline"
            size={isSingleProvider ? "lg" : "default"}
            disabled={isBusy}
            aria-label={action.fullLabel}
            onClick={action.onClick}
          >
            {action.icon ? <span className="shrink-0">{action.icon}</span> : null}
            <span className="min-w-0 truncate">
              {isSingleProvider ? action.fullLabel : action.shortLabel}
            </span>
          </Button>
        ))}
      </div>
    </div>
  );
}
