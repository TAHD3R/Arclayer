import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@celestial/ui/button";
import { SettingCard, SettingCardContent } from "@celestial/ui/setting-card";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@celestial/ui/popover";

import { issueSSOLinkState, listSSOProviders } from "@/api/auth-sso";
import { listMyOAuthIdentities, unlinkMyOAuthIdentity } from "@/api/oauth-social";
import { ContentGuard } from "@/components/common/content-guard";
import GitHubDarkIcon from "@celestial/ui/icons/github-dark-icon";
import GitHubLightIcon from "@celestial/ui/icons/github-light-icon";
import GoogleIcon from "@celestial/ui/icons/google-icon";
import { ApiError } from "@/lib/http";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { cn } from "@celestial/lib/utils";
import { useAuthStore } from "@/stores/use-auth-store";
import { usePreferencesStore } from "@/stores/use-preference-store";

function normalizeProvider(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function appendQueryParam(url: string, key: string, value: string): string {
  const raw = String(url || "");
  if (!raw) return raw;
  const sep = raw.includes("?") ? "&" : "?";
  return `${raw}${sep}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

export type MeProfileLinkedAccountsSectionProps = {
  redirect: string;
};

export function MeProfileLinkedAccountsSection(props: MeProfileLinkedAccountsSectionProps) {
  const { t } = useTranslation("account");
  const accessToken = useAuthStore((s) => s.accessToken);
  const sessionVersion = useAuthStore((s) => s.sessionVersion);
  const queryClient = useQueryClient();
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const isDark = themeMode === "dark";
  const GitHubIcon = isDark ? GitHubDarkIcon : GitHubLightIcon;

  const providersQuery = useQuery({
    queryKey: ["auth", "sso", "providers", props.redirect],
    queryFn: async () => listSSOProviders({ redirect: props.redirect }),
    staleTime: 15 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const identitiesQuery = useQuery({
    queryKey: ["me", "oauth", "identities", sessionVersion],
    enabled: Boolean(accessToken),
    queryFn: async () => listMyOAuthIdentities(),
    staleTime: 10 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const issueLinkStateMutation = useMutation({
    mutationFn: async () => issueSSOLinkState(),
    onError: (err) => notifyError(err),
  });

  const unlinkIdentityMutation = useMutation({
    mutationFn: async (provider: string) => unlinkMyOAuthIdentity(provider),
    onSuccess: async () => {
      notifySuccessText(t("settings:SETTINGS_SAVED"));
      await queryClient.invalidateQueries({ queryKey: ["me", "oauth", "identities"] });
    },
    onError: (err) => notifyError(err),
  });

  const providerRows = useMemo(() => {
    const providers = providersQuery.data?.providers ?? [];
    const identities =
      identitiesQuery.error instanceof ApiError && identitiesQuery.error.status === 404
        ? []
        : (identitiesQuery.data?.identities ?? []);

    const identityByProvider = new Map<string, { email: string | null }>();
    for (const id of identities) {
      identityByProvider.set(normalizeProvider(id.provider), {
        email: id.email ?? null,
      });
    }

    const normalizedProviders = providers.map((p) => ({
      provider: normalizeProvider(p.provider),
      label: String(p.label || p.provider || ""),
      startUrl: String(p.startUrl || p.start_url || ""),
    }));

    const seen = new Set<string>();
    const rows: Array<{
      provider: string;
      label: string;
      startUrl: string;
      linkedEmail: string | null;
      linked: boolean;
      enabled: boolean;
    }> = [];

    for (const p of normalizedProviders) {
      const linked = identityByProvider.get(p.provider);
      rows.push({
        provider: p.provider,
        label: p.label || p.provider,
        startUrl: p.startUrl,
        linkedEmail: linked?.email ?? null,
        linked: Boolean(linked),
        enabled: Boolean(p.startUrl),
      });
      seen.add(p.provider);
    }

    for (const [provider, linked] of identityByProvider.entries()) {
      if (seen.has(provider)) continue;
      rows.push({
        provider,
        label: provider,
        startUrl: "",
        linkedEmail: linked.email,
        linked: true,
        enabled: false,
      });
    }

    return rows;
  }, [identitiesQuery.data?.identities, identitiesQuery.error, providersQuery.data?.providers]);

  const loading = providersQuery.isLoading || identitiesQuery.isLoading;
  const rawError = providersQuery.error ?? identitiesQuery.error;
  const [disconnectPopoverProvider, setDisconnectPopoverProvider] = useState<string | null>(null);
  // In self-host / plugin-disabled environments, the linked-identity endpoint may not exist yet.
  // Treat that as "no linked accounts feature available" rather than a page-level 404.
  const error = rawError instanceof ApiError && rawError.status === 404 ? null : rawError;
  const empty = !loading && !error && providerRows.length === 0;

  return (
    <SettingCard>
      <ContentGuard
        loading={loading}
        error={error}
        empty={empty}
        variant="compact"
        mediaVariant="none"
        className="py-0"
        emptyTitle={t("ME_LINKED_ACCOUNTS_EMPTY")}
      >
        <SettingCardContent className="p-0 sm:p-0">
          <div className="divide-y divide-border px-6">
            {providerRows.map((row) => {
              const isGoogle = row.provider === "google";
              const isGithub = row.provider === "github";
              const icon = isGoogle ? (
                <GoogleIcon size={14} />
              ) : isGithub ? (
                <GitHubIcon size={14} />
              ) : null;

              return (
                <div key={row.provider} className="py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex items-center gap-3">
                    <div className={cn("shrink-0", icon ? "opacity-90" : "opacity-60")}>
                      {icon ?? (
                        <span className="text-caption">
                          {row.provider.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-callout font-semibold text-label-primary truncate">
                        {row.label}
                      </div>
                      {row.linkedEmail ? (
                        <div className="text-callout text-label-secondary truncate">
                          {row.linkedEmail}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    {row.linked ? (
                      <Popover
                        open={disconnectPopoverProvider === row.provider}
                        onOpenChange={(open) => {
                          if (unlinkIdentityMutation.isPending) return;
                          setDisconnectPopoverProvider(open ? row.provider : null);
                        }}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            variant="destructive"
                            disabled={unlinkIdentityMutation.isPending}
                            loading={unlinkIdentityMutation.isPending}
                          >
                            {t("ME_LINKED_ACCOUNTS_DISCONNECT")}
                          </Button>
                        </PopoverTrigger>

                        <PopoverContent
                          align="end"
                          sideOffset={8}
                          className="w-[320px] max-w-[min(320px,calc(100vw-2rem))] p-3"
                        >
                          <div className="text-callout text-label-primary">
                            {t("ME_LINKED_ACCOUNTS_DISCONNECT_CONFIRM")}
                          </div>
                          <div className="mt-3 flex items-center justify-end gap-2">
                            <PopoverClose asChild>
                              <Button variant="ghost" disabled={unlinkIdentityMutation.isPending}>
                                {t("common:CANCEL")}
                              </Button>
                            </PopoverClose>
                            <Button
                              variant="destructive"
                              disabled={unlinkIdentityMutation.isPending}
                              loading={unlinkIdentityMutation.isPending}
                              onClick={() => {
                                void unlinkIdentityMutation
                                  .mutateAsync(row.provider)
                                  .then(() => setDisconnectPopoverProvider(null));
                              }}
                            >
                              {t("ME_LINKED_ACCOUNTS_DISCONNECT")}
                            </Button>
                          </div>
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <Button
                        disabled={
                          !row.startUrl ||
                          issueLinkStateMutation.isPending ||
                          providersQuery.isLoading ||
                          identitiesQuery.isLoading
                        }
                        loading={issueLinkStateMutation.isPending}
                        onClick={() => {
                          void (async () => {
                            const issued = await issueLinkStateMutation.mutateAsync();
                            const nextUrl = appendQueryParam(
                              row.startUrl,
                              "link_state",
                              issued.token,
                            );
                            window.location.assign(nextUrl);
                          })();
                        }}
                      >
                        {t("ME_LINKED_ACCOUNTS_CONNECT")}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </SettingCardContent>
      </ContentGuard>
    </SettingCard>
  );
}
