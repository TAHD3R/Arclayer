import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import { SettingCard, SettingCardContent } from "@arclayer/ui/setting-card";
import { SettingDialog } from "@arclayer/ui/setting-dialog";

import { issueSSOLinkState, listSSOProviders } from "@/api/auth-sso";
import { listMyOAuthIdentities, unlinkMyOAuthIdentity } from "@/api/oauth-social";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { normalizeOAuthProvider, resolveOAuthProviderMeta } from "@/lib/auth/oauth-provider-meta";
import { ApiError } from "@/lib/http";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { cn } from "@arclayer/lib/utils";
import { UserCenterSettingPanel } from "@/pages/usercenter/shared/usercenter-setting-panel";
import { useAuthStore } from "@/stores/use-auth-store";
import { usePreferencesStore } from "@/stores/use-preference-store";

function appendQueryParam(url: string, key: string, value: string): string {
  const raw = String(url || "");
  if (!raw) return raw;
  const sep = raw.includes("?") ? "&" : "?";
  return `${raw}${sep}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

export type UserLinkedAccountsSectionProps = {
  redirect: string;
  mode?: "page" | "dialog";
};

export function UserLinkedAccountsSection(props: UserLinkedAccountsSectionProps) {
  const { t } = useTranslation(["account", "auth", "common"]);
  const accessToken = useAuthStore((s) => s.accessToken);
  const sessionVersion = useAuthStore((s) => s.sessionVersion);
  const queryClient = useQueryClient();
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const isDark = themeMode === "dark";
  const panelVariant = props.mode ?? "page";
  const [disconnectDialogProvider, setDisconnectDialogProvider] = useState<string | null>(null);
  const [linkingProvider, setLinkingProvider] = useState<string | null>(null);

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
      identityByProvider.set(normalizeOAuthProvider(id.provider), {
        email: id.email ?? null,
      });
    }

    const normalizedProviders = providers.map((provider) =>
      resolveOAuthProviderMeta({ provider, t, isDark }),
    );

    const seen = new Set<string>();
    const rows: Array<{
      provider: string;
      title: string;
      shortLabel: string;
      startUrl: string;
      linkedEmail: string | null;
      linked: boolean;
      enabled: boolean;
      icon: ReactNode;
    }> = [];

    for (const p of normalizedProviders) {
      const linked = identityByProvider.get(p.provider);
      rows.push({
        provider: p.provider,
        title: p.title,
        shortLabel: p.shortLabel,
        startUrl: p.startUrl,
        linkedEmail: linked?.email ?? null,
        linked: Boolean(linked),
        enabled: Boolean(p.startUrl),
        icon: p.icon,
      });
      seen.add(p.provider);
    }

    for (const [provider, linked] of identityByProvider.entries()) {
      if (seen.has(provider)) continue;
      const meta = resolveOAuthProviderMeta({ provider: { provider }, t, isDark });
      rows.push({
        provider: meta.provider,
        title: meta.title,
        shortLabel: meta.shortLabel,
        startUrl: meta.startUrl,
        linkedEmail: linked.email,
        linked: true,
        enabled: false,
        icon: meta.icon,
      });
    }

    return rows;
  }, [
    identitiesQuery.data?.identities,
    identitiesQuery.error,
    isDark,
    providersQuery.data?.providers,
    t,
  ]);

  const loading = providersQuery.isLoading || identitiesQuery.isLoading;
  const rawError = providersQuery.error ?? identitiesQuery.error;
  // In self-host environments, the linked-identity endpoint may not exist yet.
  // Treat that as an unavailable linked-accounts feature rather than a page-level 404.
  const error = rawError instanceof ApiError && rawError.status === 404 ? null : rawError;
  const empty = !loading && !error && providerRows.length === 0;
  const selectedDisconnectRow =
    providerRows.find((row) => row.provider === disconnectDialogProvider) ?? null;

  async function handleLink(provider: string, startUrl: string) {
    if (!startUrl || linkingProvider) return;
    setLinkingProvider(provider);
    try {
      const issued = await issueSSOLinkState();
      const nextUrl = appendQueryParam(startUrl, "link_state", issued.token);
      window.location.assign(nextUrl);
    } catch (error) {
      notifyError(error);
      setLinkingProvider(null);
    }
  }

  if (empty) return null;

  return (
    <>
      <UserCenterSettingPanel
        title={t("account:ME_LINKED_ACCOUNTS_PANEL_TITLE")}
        showDivider
        variant={panelVariant}
      >
        <SettingCard>
          <ContentGuard
            loading={loading}
            error={error}
            variant="compact"
            mediaVariant="none"
            className="py-0"
          >
            <SettingCardContent className="p-0 sm:p-0">
              <div>
                {providerRows.map((row) => (
                  <div key={row.provider} className="py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0 flex items-center gap-3">
                      <div className={cn("shrink-0 opacity-90")}>{row.icon}</div>
                      <div className="min-w-0">
                        <div className="text-callout font-semibold text-label-primary truncate">
                          {row.title}
                        </div>
                        {row.linkedEmail ? (
                          <div className="mt-1 text-callout text-label-secondary truncate">
                            {t("account:ME_LINKED_ACCOUNTS_CURRENT_ACCOUNT", {
                              email: row.linkedEmail,
                            })}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      {row.linked ? (
                        <Button
                          variant="destructive"
                          disabled={unlinkIdentityMutation.isPending}
                          loading={
                            unlinkIdentityMutation.isPending &&
                            selectedDisconnectRow?.provider === row.provider
                          }
                          onClick={() => setDisconnectDialogProvider(row.provider)}
                        >
                          {t("account:ME_LINKED_ACCOUNTS_DISCONNECT")}
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          disabled={
                            !row.startUrl ||
                            providersQuery.isLoading ||
                            identitiesQuery.isLoading ||
                            unlinkIdentityMutation.isPending ||
                            linkingProvider === row.provider
                          }
                          loading={linkingProvider === row.provider}
                          onClick={() => void handleLink(row.provider, row.startUrl)}
                        >
                          {t("account:ME_LINKED_ACCOUNTS_CONNECT")}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </SettingCardContent>
          </ContentGuard>
        </SettingCard>
      </UserCenterSettingPanel>

      <SettingDialog
        open={Boolean(selectedDisconnectRow)}
        onOpenChange={(open) => {
          if (!open && !unlinkIdentityMutation.isPending) setDisconnectDialogProvider(null);
        }}
        title={t("account:ME_LINKED_ACCOUNTS_DISCONNECT_DIALOG_TITLE")}
        description={
          selectedDisconnectRow
            ? t("account:ME_LINKED_ACCOUNTS_DISCONNECT_DIALOG_DESC", {
                provider: selectedDisconnectRow.shortLabel,
              })
            : undefined
        }
        footer={
          <>
            <Button
              variant="ghost"
              disabled={unlinkIdentityMutation.isPending}
              onClick={() => setDisconnectDialogProvider(null)}
            >
              {t("common:CANCEL")}
            </Button>
            <Button
              variant="destructive"
              disabled={!selectedDisconnectRow}
              loading={unlinkIdentityMutation.isPending}
              onClick={() => {
                if (!selectedDisconnectRow) return;
                void unlinkIdentityMutation.mutateAsync(selectedDisconnectRow.provider).then(() => {
                  setDisconnectDialogProvider(null);
                });
              }}
            >
              {t("account:ME_LINKED_ACCOUNTS_DISCONNECT")}
            </Button>
          </>
        }
      >
        <></>
      </SettingDialog>
    </>
  );
}
