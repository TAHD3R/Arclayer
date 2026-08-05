import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { listSSOProviders } from "@/api/auth-sso";
import { resolveOAuthProviderMeta } from "@/lib/auth/oauth-provider-meta";
import { notifyErrorText } from "@/lib/notifications";
import { usePreferencesStore } from "@/stores/use-preference-store";
import { Button } from "@arclayer/ui/button";
import { cn } from "@arclayer/lib/utils";

export interface AuthOauthButtonsProps {
  disabled?: boolean;
  redirect?: string | undefined;
  dividerLabelKey?: string;
  dividerPlacement?: "before" | "after";
  providerLayout?: "stacked" | "primary-plus-grid";
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
const AUTH_DIVIDER_SEGMENTS = Array.from({ length: 5 }, (_, index) => index);

function AuthDividerLine() {
  return (
    <span
      data-testid="oauth-divider-line"
      aria-hidden="true"
      className="flex min-w-0 flex-1 items-center justify-center gap-4 overflow-hidden"
    >
      {AUTH_DIVIDER_SEGMENTS.map((segment) => (
        <span
          key={segment}
          data-testid="oauth-divider-segment"
          className={cn(
            "h-px w-4 shrink-0 bg-foreground/25",
            segment === AUTH_DIVIDER_SEGMENTS.length - 1 ? "max-[359px]:hidden" : undefined,
          )}
        />
      ))}
    </span>
  );
}

export function AuthOauthButtons({
  disabled = false,
  redirect,
  dividerLabelKey = "auth:OAUTH_ACCOUNT_DIVIDER",
  dividerPlacement = "before",
  providerLayout = "stacked",
  showProviders = true,
  loadingProvider = null,
  onProviderStart,
  leadingActions = [],
}: AuthOauthButtonsProps) {
  const { t } = useTranslation();
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const isDark = themeMode === "dark";
  const providersQuery = useQuery({
    queryKey: ["auth", "sso", "providers", redirect],
    queryFn: async () => listSSOProviders({ redirect }),
    enabled: showProviders,
    staleTime: 15 * 1000,
    retry: false,
  });

  const providers = showProviders
    ? (providersQuery.data?.providers ?? []).map((provider) =>
        resolveOAuthProviderMeta({ provider, t, isDark }),
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
    isLoading: provider.provider === loadingProvider,
    onClick: () => {
      if (!provider.startUrl) {
        notifyErrorText(t("auth:OAUTH_ERROR_GENERIC"));
        return;
      }
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
  const dividerSpacingClassName = dividerPlacement === "after" ? "pt-3" : "py-2";
  const divider = (
    <div
      data-testid="oauth-divider"
      className={`flex items-center gap-3 text-footnote text-label-secondary ${dividerSpacingClassName}`}
    >
      <AuthDividerLine />
      <span className="shrink-0 select-none">{t(dividerLabelKey)}</span>
      <AuthDividerLine />
    </div>
  );

  function renderProviderContent(action: (typeof providerActions)[number], label: string) {
    if (action.isLoading) return null;

    return (
      <>
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
      {providerActions.length > 0 && providerLayout === "primary-plus-grid" ? (
        <div className="grid gap-3" data-testid="oauth-primary-plus-grid">
          {providerActions.slice(0, 1).map((action) => (
            <Button
              key={action.key}
              className="h-14! w-full justify-center rounded-full! border-transparent! bg-foreground! px-4 text-background! hover:bg-foreground/90! hover:text-background!"
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
          {providerActions.length > 1 ? (
            <div className="grid grid-cols-3 gap-2">
              {providerActions.slice(1).map((action) => (
                <Button
                  key={action.key}
                  className="h-14! w-full justify-center rounded-full! border-border/80! bg-card! px-3 hover:bg-accent!"
                  variant="outline"
                  size="lg"
                  disabled={isBusy || action.isLoading}
                  loading={action.isLoading}
                  aria-label={action.fullLabel}
                  onClick={action.onClick}
                >
                  {action.isLoading ? null : action.icon}
                  <span className="sr-only">{action.fullLabel}</span>
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      ) : providerActions.length > 0 ? (
        <div className="grid gap-2.5">
          {providerActions.map((action) => (
            <Button
              key={action.key}
              className="h-10 w-full justify-center rounded-md px-4"
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
