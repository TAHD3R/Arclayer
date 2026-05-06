import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { listSSOProviders } from "@/api/auth-sso";
import { STORAGE_KEYS } from "@/constants/storage";
import { normalizeOAuthProvider, resolveOAuthProviderMeta } from "@/lib/auth/oauth-provider-meta";
import { notifyErrorText } from "@/lib/notifications";
import { readStorageItem, writeStorageItem } from "@/lib/storage";
import { usePreferencesStore } from "@/stores/use-preference-store";
import type { AuthSSOProvider } from "@arclayer/openapi/admin-types";
import { Badge } from "@arclayer/ui/badge";
import { Button } from "@arclayer/ui/button";
import { Separator } from "@arclayer/ui/separator";
import { cn } from "@arclayer/lib/utils";

export interface AuthOauthButtonsProps {
  disabled?: boolean;
  redirect?: string | undefined;
  dividerLabelKey?: string;
  dividerPlacement?: "before" | "after";
  showProviders?: boolean;
  loadingProvider?: string | null;
  onProviderStart?: (input: { provider: string; startUrl: string }) => void;
  leadingActions?: Array<{
    key: string;
    label: string;
    shortLabel?: string;
    icon?: ReactNode;
    onClick: () => void;
  }>;
}

const FULL_WIDTH_LEADING_ACTION_KEYS = new Set(["email-code", "password-login"]);

export function AuthOauthButtons({
  disabled = false,
  redirect,
  dividerLabelKey = "auth:OAUTH_ACCOUNT_DIVIDER",
  dividerPlacement = "before",
  showProviders = true,
  loadingProvider = null,
  onProviderStart,
  leadingActions = [],
}: AuthOauthButtonsProps) {
  const { t } = useTranslation();
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const isDark = themeMode === "dark";
  const [lastUsedProvider, setLastUsedProvider] = useState(() =>
    normalizeOAuthProvider(readStorageItem(STORAGE_KEYS.authLastSsoProvider)),
  );

  const providersQuery = useQuery({
    queryKey: ["auth", "sso", "providers", redirect],
    queryFn: async () => listSSOProviders({ redirect }),
    enabled: showProviders,
    staleTime: 15 * 1000,
    retry: false,
  });

  const providers = showProviders
    ? (providersQuery.data?.providers ?? []).map((provider) =>
        resolveOAuthProviderMeta({ provider: provider as AuthSSOProvider, t, isDark }),
      )
    : [];
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
    icon: provider.icon,
    isLastUsed: provider.provider === lastUsedProvider,
    isLoading: provider.provider === loadingProvider,
    onClick: () => {
      if (!provider.startUrl) {
        notifyErrorText(t("auth:OAUTH_ERROR_GENERIC"));
        return;
      }
      writeStorageItem(STORAGE_KEYS.authLastSsoProvider, provider.provider);
      setLastUsedProvider(provider.provider);
      if (onProviderStart) {
        onProviderStart({
          provider: provider.provider,
          startUrl: provider.startUrl,
        });
        return;
      }
      window.location.assign(provider.startUrl);
    },
  }));
  const hasAnyAction =
    fullWidthLeadingActions.length > 0 ||
    inlineLeadingActions.length > 0 ||
    providerActions.length > 0;
  if (!hasAnyAction) return null;

  const isBusy = disabled || (showProviders && providersQuery.isLoading);
  const isSingleInlineLeadingAction = inlineLeadingActions.length === 1;
  const lastUsedLabel = t("auth:OAUTH_LAST_USED");
  const dividerSpacingClassName = dividerPlacement === "after" ? "pt-3" : "py-2";
  const divider = (
    <div
      className={`flex items-center gap-3 text-footnote text-label-secondary ${dividerSpacingClassName}`}
    >
      <Separator className="flex-1" />
      <span className="shrink-0">{t(dividerLabelKey)}</span>
      <Separator className="flex-1" />
    </div>
  );

  function renderProviderContent(action: (typeof providerActions)[number], label: string) {
    if (action.isLoading) return null;

    return (
      <>
        {action.isLastUsed ? (
          <Badge
            variant="outline"
            className="pointer-events-none absolute -top-2 right-2 border-primary/20 bg-popover px-1.5 font-semibold text-primary"
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
          {label}
        </span>
      </>
    );
  }

  return (
    <div className="grid gap-2.5">
      {dividerPlacement === "before" ? divider : null}
      {fullWidthLeadingActions.length > 0 ? (
        <div className="grid gap-2.5">
          {fullWidthLeadingActions.map((action) => (
            <Button
              key={action.key}
              className="h-10 w-full justify-center rounded-md  px-4 "
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
                "h-10 rounded-md  ",
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
      {providerActions.length > 0 ? (
        <div className="grid gap-2.5">
          {providerActions.map((action) => (
            <Button
              key={action.key}
              className="relative h-10 w-full justify-center rounded-md  px-4 "
              variant="outline"
              size="lg"
              disabled={isBusy || action.isLoading}
              loading={action.isLoading}
              aria-label={action.fullLabel}
              onClick={action.onClick}
            >
              {renderProviderContent(action, action.fullLabel)}
            </Button>
          ))}
        </div>
      ) : null}
      {dividerPlacement === "after" ? divider : null}
    </div>
  );
}
