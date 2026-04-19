import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CircleEllipsisIcon } from "lucide-react";

import { listSSOProviders } from "@/api/auth-sso";
import { STORAGE_KEYS } from "@/constants/storage";
import { notifyErrorText } from "@/lib/notifications";
import { readStorageItem, writeStorageItem } from "@/lib/storage";
import { usePreferencesStore } from "@/stores/use-preference-store";
import type { AuthSSOProvider } from "@/types/api";
import { Badge } from "@arclayer/ui/badge";
import { Button } from "@arclayer/ui/button";
import GitHubDarkIcon from "@arclayer/ui/icons/github-dark-icon";
import GitHubLightIcon from "@arclayer/ui/icons/github-light-icon";
import GoogleIcon from "@arclayer/ui/icons/google-icon";
import { Separator } from "@arclayer/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@arclayer/ui/tooltip";
import { cn } from "@arclayer/lib/utils";

export interface AuthOauthButtonsProps {
  disabled?: boolean;
  redirect?: string | undefined;
  dividerLabelKey?: string;
  leadingActions?: Array<{
    key: string;
    label: string;
    shortLabel?: string;
    icon?: ReactNode;
    onClick: () => void;
  }>;
}

const FULL_WIDTH_LEADING_ACTION_KEYS = new Set(["email-code", "password-login"]);

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
  dividerLabelKey = "auth:OAUTH_ACCOUNT_DIVIDER",
  leadingActions = [],
}: AuthOauthButtonsProps) {
  const { t } = useTranslation();
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const isDark = themeMode === "dark";
  const [lastUsedProvider, setLastUsedProvider] = useState(() =>
    normalizeProvider(readStorageItem(STORAGE_KEYS.authLastSsoProvider)),
  );

  const providersQuery = useQuery({
    queryKey: ["auth", "sso", "providers", redirect],
    queryFn: async () => listSSOProviders({ redirect }),
    staleTime: 15 * 1000,
    retry: false,
  });

  const providers = (providersQuery.data?.providers ?? []).map((provider) =>
    resolveProviderMeta(provider, t, isDark),
  );
  const fullWidthLeadingActions = leadingActions
    .filter((action) => FULL_WIDTH_LEADING_ACTION_KEYS.has(action.key))
    .map((action) => ({
      key: action.key,
      fullLabel: action.label,
      icon: action.icon,
      onClick: action.onClick,
    }));
  const inlineLeadingActions = leadingActions
    .filter((action) => !FULL_WIDTH_LEADING_ACTION_KEYS.has(action.key))
    .map((action) => ({
      key: action.key,
      fullLabel: action.label,
      shortLabel: action.shortLabel ?? action.label,
      icon: action.icon,
      onClick: action.onClick,
    }));
  const providerActions = providers.map((provider) => ({
    key: provider.provider,
    fullLabel: provider.fullLabel,
    shortLabel: provider.shortLabel,
    icon: provider.icon,
    isLastUsed: provider.provider === lastUsedProvider,
    onClick: () => {
      if (!provider.startUrl) {
        notifyErrorText(t("auth:OAUTH_ERROR_GENERIC"));
        return;
      }
      writeStorageItem(STORAGE_KEYS.authLastSsoProvider, provider.provider);
      setLastUsedProvider(provider.provider);
      window.location.assign(provider.startUrl);
    },
  }));
  const hasAnyAction =
    fullWidthLeadingActions.length > 0 ||
    inlineLeadingActions.length > 0 ||
    providerActions.length > 0;
  if (!hasAnyAction) return null;

  const isBusy = disabled || providersQuery.isLoading;
  const isSingleInlineLeadingAction = inlineLeadingActions.length === 1;
  const providerCount = providerActions.length;
  const isSingleProvider = providerCount === 1;
  const isPairProviderLayout = providerCount === 2;
  const isIconProviderLayout = providerCount >= 3;
  const providerGridClassName =
    providerCount === 3 ? "grid-cols-3" : providerCount >= 4 ? "grid-cols-4" : "";
  const lastUsedLabel = t("auth:OAUTH_LAST_USED");
  const divider = (
    <div className="flex items-center gap-3 py-1 text-footnote text-label-secondary">
      <Separator className="flex-1" />
      <span className="shrink-0">{t(dividerLabelKey)}</span>
      <Separator className="flex-1" />
    </div>
  );

  return (
    <div className="grid gap-2.5">
      {divider}
      {fullWidthLeadingActions.length > 0 ? (
        <div className="grid gap-2.5">
          {fullWidthLeadingActions.map((action) => (
            <Button
              key={action.key}
              className="h-10 w-full justify-center rounded-md border-border/80 bg-card/80 px-4 transition-colors hover:bg-accent/35"
              variant="outline"
              size="lg"
              disabled={isBusy}
              aria-label={action.fullLabel}
              onClick={action.onClick}
            >
              {action.icon ? (
                <span className="inline-flex shrink-0 items-center justify-center self-center">
                  {action.icon}
                </span>
              ) : null}
              <span className="inline-flex min-w-0 items-center justify-center truncate text-center">
                {action.fullLabel}
              </span>
            </Button>
          ))}
        </div>
      ) : null}
      {inlineLeadingActions.length > 0 ? (
        <div
          className={cn(
            isSingleInlineLeadingAction ? "grid grid-cols-1 gap-2.5" : "grid grid-cols-2 gap-2.5",
          )}
        >
          {inlineLeadingActions.map((action) => (
            <Button
              key={action.key}
              className={cn(
                "h-10 rounded-md border-border/80 bg-card/80 transition-colors hover:bg-accent/35",
                isSingleInlineLeadingAction
                  ? "h-10 w-full justify-center px-4"
                  : "w-full justify-center px-3 text-footnote",
              )}
              variant="outline"
              size={isSingleInlineLeadingAction ? "lg" : "default"}
              disabled={isBusy}
              aria-label={action.fullLabel}
              onClick={action.onClick}
            >
              {action.icon ? (
                <span className="inline-flex shrink-0 items-center justify-center self-center">
                  {action.icon}
                </span>
              ) : null}
              <span className="inline-flex min-w-0 items-center justify-center truncate text-center">
                {isSingleInlineLeadingAction ? action.fullLabel : action.shortLabel}
              </span>
            </Button>
          ))}
        </div>
      ) : null}
      {isSingleProvider ? (
        <div className="grid gap-2.5">
          {providerActions.map((action) => (
            <Button
              key={action.key}
              className="relative h-10 w-full justify-center rounded-md border-border/80 bg-card/80 px-4 transition-colors hover:bg-accent/35"
              variant="outline"
              size="lg"
              disabled={isBusy}
              aria-label={action.fullLabel}
              onClick={action.onClick}
            >
              {action.isLastUsed ? (
                <Badge
                  variant="outline"
                  className="pointer-events-none absolute -top-2 right-2 border-primary/20 bg-popover px-1.5 text-[10px] font-semibold text-primary"
                >
                  {lastUsedLabel}
                </Badge>
              ) : null}
              {action.icon ? (
                <span className="inline-flex shrink-0 items-center justify-center self-center">
                  {action.icon}
                </span>
              ) : null}
              <span className="inline-flex min-w-0 items-center justify-center truncate text-center">
                {action.fullLabel}
              </span>
            </Button>
          ))}
        </div>
      ) : null}
      {isPairProviderLayout ? (
        <div className="grid grid-cols-2 gap-2.5">
          {providerActions.map((action) => (
            <Button
              key={action.key}
              className="relative h-10 w-full justify-center rounded-md border-border/80 bg-card/80 px-3 text-footnote transition-colors hover:bg-accent/35"
              variant="outline"
              disabled={isBusy}
              aria-label={action.fullLabel}
              onClick={action.onClick}
            >
              {action.isLastUsed ? (
                <Badge
                  variant="outline"
                  className="pointer-events-none absolute -top-2 right-2 border-primary/20 bg-popover px-1.5 text-[10px] font-semibold text-primary"
                >
                  {lastUsedLabel}
                </Badge>
              ) : null}
              {action.icon ? (
                <span className="inline-flex shrink-0 items-center justify-center self-center">
                  {action.icon}
                </span>
              ) : null}
              <span className="inline-flex min-w-0 items-center justify-center truncate text-center">
                {action.shortLabel}
              </span>
            </Button>
          ))}
        </div>
      ) : null}
      {isIconProviderLayout ? (
        <TooltipProvider>
          <div className={cn("grid gap-2.5", providerGridClassName)}>
            {providerActions.map((action) => (
              <Tooltip key={action.key}>
                <TooltipTrigger asChild focusTrigger={false}>
                  <Button
                    className="relative h-11 w-full justify-center rounded-md border-border/80 bg-card/80 px-0 transition-colors hover:bg-accent/35"
                    variant="outline"
                    disabled={isBusy}
                    aria-label={action.fullLabel}
                    onClick={action.onClick}
                  >
                    {action.isLastUsed ? (
                      <Badge
                        variant="outline"
                        className="pointer-events-none absolute -top-2 right-1.5 border-primary/20 bg-popover px-1.5 text-[10px] font-semibold text-primary"
                      >
                        {lastUsedLabel}
                      </Badge>
                    ) : null}
                    <span className="inline-flex shrink-0 items-center justify-center self-center">
                      {action.icon}
                    </span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{action.shortLabel}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        </TooltipProvider>
      ) : null}
    </div>
  );
}
