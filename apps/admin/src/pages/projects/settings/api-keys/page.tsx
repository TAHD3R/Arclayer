import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  createProjectApiKey,
  listProjectApiKeys,
  revokeProjectApiKey,
  rotateProjectApiKey,
} from "@/api/project-settings";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { copyToClipboard } from "@/lib/clipboard";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import { useProjectPermissionAccess } from "@/hooks/use-workspace-permission-access";
import { BaseTag } from "@/components/ui/tags";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { Textarea } from "@arclayer/ui/textarea";
import type { ApiKeyCreateOut, ApiKeyOut, DeliveryKeyPerspective } from "@arclayer/openapi";

const PROJECT_API_KEYS_QUERY_KEY_PREFIX = ["project", "api-keys"] as const;

type SecretReveal = {
  keyId: string;
  secretToken: string;
};

function buildProjectApiKeysQueryKey(projectId: string) {
  return [...PROJECT_API_KEYS_QUERY_KEY_PREFIX, projectId] as const;
}

function ApiKeyFamilyTag(props: { item: ApiKeyOut }) {
  const { t } = useTranslation("account");
  const label =
    props.item.family === "delivery"
      ? t("SETTINGS_PROJECT_API_KEYS_FAMILY_DELIVERY")
      : t("SETTINGS_PROJECT_API_KEYS_FAMILY_SERVICE");
  const color = props.item.family === "delivery" ? "blue" : "default";
  return <BaseTag color={color}>{label}</BaseTag>;
}

function ApiKeyStatusTag(props: { item: ApiKeyOut }) {
  const { t } = useTranslation("account");
  if (props.item.revokedAt) {
    return <BaseTag color="default">{t("SETTINGS_PROJECT_API_KEYS_STATUS_REVOKED")}</BaseTag>;
  }
  if (props.item.expiresAt && new Date(props.item.expiresAt).getTime() < Date.now()) {
    return <BaseTag color="gold">{t("SETTINGS_PROJECT_API_KEYS_STATUS_EXPIRED")}</BaseTag>;
  }
  return <BaseTag color="green">{t("SETTINGS_PROJECT_API_KEYS_STATUS_ACTIVE")}</BaseTag>;
}

function perspectiveKey(perspective: DeliveryKeyPerspective | null | undefined) {
  return perspective === "preview"
    ? "SETTINGS_PROJECT_API_KEYS_PERSPECTIVE_PREVIEW"
    : "SETTINGS_PROJECT_API_KEYS_PERSPECTIVE_PUBLISHED";
}

function ApiKeyScopes(props: { item: ApiKeyOut }) {
  const { t } = useTranslation("account");
  const scopes = props.item.scopes ?? [];
  if (scopes.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        {t("SETTINGS_PROJECT_API_KEYS_SCOPES_EMPTY")}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {scopes.map((scope) => (
        <BaseTag key={scope} color="default">
          {scope}
        </BaseTag>
      ))}
    </div>
  );
}

function SecretRevealPanel(props: { reveal: SecretReveal | null; onDismiss: () => void }) {
  const { t } = useTranslation(["account", "common"]);

  if (!props.reveal) return null;

  return (
    <div className="rounded-[28px] border border-sky-200/80 bg-sky-50/80 p-5 dark:border-sky-900/70 dark:bg-sky-950/30">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ShieldCheck size={16} className="text-sky-600 dark:text-sky-400" />
            {t("account:SETTINGS_PROJECT_API_KEYS_SECRET_TITLE")}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {t("account:SETTINGS_PROJECT_API_KEYS_SECRET_DESC")}
          </div>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={props.onDismiss}>
          {t("common:CLOSE")}
        </Button>
      </div>

      <div className="mt-4 rounded-2xl border border-border/60 bg-background/90 px-4 py-3">
        <div className="text-xs font-medium text-muted-foreground">
          {t("account:SETTINGS_PROJECT_API_KEYS_SECRET_VALUE")}
        </div>
        <code className="mt-2 block break-all text-sm font-medium text-foreground">
          {props.reveal.secretToken}
        </code>
      </div>
    </div>
  );
}

function ApiKeyRow(props: {
  item: ApiKeyOut;
  reveal: SecretReveal | null;
  onCopyMask: (tokenMask: string) => void;
  onRotate: (keyId: string) => void;
  onRevoke: (keyId: string) => void;
  pending: boolean;
  formatDateTime: (value: string | null | undefined) => string;
}) {
  const { t } = useTranslation("account");
  const createdAt = props.formatDateTime(props.item.createdAt);
  const lastUsedAt = props.formatDateTime(props.item.lastUsedAt);
  const expiresAt = props.formatDateTime(props.item.expiresAt);
  const revokedAt = props.formatDateTime(props.item.revokedAt);
  const revealMatches = props.reveal?.keyId === props.item.id;

  return (
    <div className="rounded-[24px] border border-border/60 bg-background/80 px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">
              {props.item.name}
            </span>
            <ApiKeyFamilyTag item={props.item} />
            <ApiKeyStatusTag item={props.item} />
            {props.item.family === "delivery" && props.item.deliveryPerspective ? (
              <BaseTag color="blue">{t(perspectiveKey(props.item.deliveryPerspective))}</BaseTag>
            ) : null}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {props.item.description || t("SETTINGS_PROJECT_API_KEYS_DESCRIPTION_EMPTY")}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={props.pending}
            onClick={() => props.onCopyMask(props.item.tokenMask)}
          >
            <Copy size={16} />
            {t("SETTINGS_PROJECT_API_KEYS_COPY_MASK")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={props.pending || Boolean(props.item.revokedAt)}
            onClick={() => props.onRotate(props.item.id)}
          >
            <RefreshCw size={16} />
            {t("SETTINGS_PROJECT_API_KEYS_ROTATE")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={props.pending || Boolean(props.item.revokedAt)}
            onClick={() => props.onRevoke(props.item.id)}
          >
            <Trash2 size={16} />
            {t("SETTINGS_PROJECT_API_KEYS_REVOKE")}
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 text-sm text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
        <div>
          <div className="text-xs font-medium">{t("SETTINGS_PROJECT_API_KEYS_MASK")}</div>
          <div className="mt-1 break-all text-foreground">{props.item.tokenMask}</div>
        </div>
        <div>
          <div className="text-xs font-medium">{t("SETTINGS_PROJECT_API_KEYS_CREATED_AT")}</div>
          <div className="mt-1 text-foreground">{createdAt}</div>
        </div>
        <div>
          <div className="text-xs font-medium">{t("SETTINGS_PROJECT_API_KEYS_LAST_USED")}</div>
          <div className="mt-1 text-foreground">{lastUsedAt}</div>
        </div>
        <div>
          <div className="text-xs font-medium">{t("SETTINGS_PROJECT_API_KEYS_EXPIRES_AT")}</div>
          <div className="mt-1 text-foreground">{expiresAt}</div>
        </div>
      </div>

      {props.item.revokedAt ? (
        <div className="mt-4 text-sm text-muted-foreground">
          {t("SETTINGS_PROJECT_API_KEYS_REVOKED_AT_LABEL", { value: revokedAt })}
        </div>
      ) : null}

      <div className="mt-4">
        <div className="text-xs font-medium text-muted-foreground">
          {t("SETTINGS_PROJECT_API_KEYS_SCOPES")}
        </div>
        <div className="mt-2">
          <ApiKeyScopes item={props.item} />
        </div>
      </div>

      {revealMatches ? (
        <div className="mt-4 rounded-2xl border border-border/60 bg-muted/20 px-4 py-3">
          <div className="text-xs font-medium text-muted-foreground">
            {t("SETTINGS_PROJECT_API_KEYS_SECRET_INLINE")}
          </div>
          <code className="mt-2 block break-all text-sm text-foreground">
            {props.reveal?.secretToken}
          </code>
        </div>
      ) : null}
    </div>
  );
}

export function ProjectApiKeysSettingsPage(props: { projectId: string; embedded?: boolean }) {
  const { t } = useTranslation(["account", "common"]);
  const queryClient = useQueryClient();
  const { formatDateTime } = useAdminDateTimeFormatter({ projectId: props.projectId });
  const permissionAccess = useProjectPermissionAccess(props.projectId);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [secretReveal, setSecretReveal] = useState<SecretReveal | null>(null);
  const queryKey = buildProjectApiKeysQueryKey(props.projectId);

  const apiKeysQuery = useQuery({
    queryKey,
    enabled: Boolean(props.projectId),
    queryFn: async () => listProjectApiKeys(props.projectId),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey });
  };

  const createMutation = useMutation({
    mutationFn: async () =>
      createProjectApiKey(props.projectId, {
        family: "delivery",
        name: name.trim(),
        description: description.trim() || null,
        scopes: ["delivery.read", "graphql.read"],
        deliveryPerspective: "published",
      }),
    onSuccess: async (result: ApiKeyCreateOut) => {
      setName("");
      setDescription("");
      setSecretReveal({ keyId: result.key.id, secretToken: result.secretToken });
      notifySuccessText(t("account:SETTINGS_PROJECT_API_KEYS_CREATED"));
      await invalidate();
    },
    onError: (error) => notifyError(error),
  });

  const rotateMutation = useMutation({
    mutationFn: async (keyId: string) => rotateProjectApiKey(props.projectId, keyId),
    onSuccess: async (result: ApiKeyCreateOut) => {
      setSecretReveal({ keyId: result.key.id, secretToken: result.secretToken });
      notifySuccessText(t("account:SETTINGS_PROJECT_API_KEYS_ROTATED"));
      await invalidate();
    },
    onError: (error) => notifyError(error),
  });

  const revokeMutation = useMutation({
    mutationFn: async (keyId: string) => revokeProjectApiKey(props.projectId, keyId),
    onSuccess: async () => {
      notifySuccessText(t("account:SETTINGS_PROJECT_API_KEYS_REVOKED"));
      await invalidate();
    },
    onError: (error) => notifyError(error),
  });

  const pending = createMutation.isPending || rotateMutation.isPending || revokeMutation.isPending;
  const items = apiKeysQuery.data ?? [];
  const permissionReady = permissionAccess.authzQuery.isFetched;
  const canManageApiKeys =
    Boolean(props.projectId) &&
    permissionReady &&
    permissionAccess.hasAction("project:api-keys:manage");

  const sortedItems = useMemo(
    () =>
      [...items].sort((left, right) => {
        if (left.revokedAt && !right.revokedAt) return 1;
        if (!left.revokedAt && right.revokedAt) return -1;
        return right.createdAt.localeCompare(left.createdAt);
      }),
    [items],
  );

  const handleCopyMask = async (value: string) => {
    try {
      await copyToClipboard(value);
      notifySuccessText(t("account:SETTINGS_PROJECT_API_KEYS_MASK_COPIED"));
    } catch (error) {
      notifyError(error);
    }
  };

  const content = (
    <ContentGuard
      loading={apiKeysQuery.isLoading}
      loadingVariant="form"
      error={apiKeysQuery.error}
      onRetry={apiKeysQuery.isError ? () => void apiKeysQuery.refetch() : undefined}
    >
      <div className="grid gap-6">
        {!props.embedded ? null : (
          <div className="max-w-3xl">
            <div className="text-sm font-semibold text-foreground">
              {t("account:SETTINGS_NAV_PROJECT_API_KEYS")}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {t("account:SETTINGS_PROJECT_API_KEYS_DESC")}
            </div>
          </div>
        )}
        {permissionReady && !canManageApiKeys ? (
          <div
            className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground"
            data-testid="project-api-keys-read-only-notice"
          >
            {t("account:SETTINGS_PROJECT_READ_ONLY_DESC")}
          </div>
        ) : null}
        <div className="grid gap-6">
          <SecretRevealPanel reveal={secretReveal} onDismiss={() => setSecretReveal(null)} />

          <form
            className="rounded-[28px] border border-border/60 bg-card/60 p-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (!name.trim() || !canManageApiKeys) return;
              void createMutation.mutateAsync();
            }}
          >
            <div className="flex flex-wrap items-start gap-3">
              <div className="flex size-10 items-center justify-center rounded-2xl border border-border/60 bg-background/80">
                <KeyRound size={18} className="text-muted-foreground" />
              </div>
              <div className="max-w-2xl">
                <div className="text-sm font-semibold text-foreground">
                  {t("account:SETTINGS_PROJECT_API_KEYS_CREATE_TITLE")}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {t("account:SETTINGS_PROJECT_API_KEYS_CREATE_DESC")}
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] lg:items-start">
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("account:SETTINGS_PROJECT_API_KEYS_NAME_PLACEHOLDER")}
                autoComplete="off"
                disabled={!canManageApiKeys}
              />
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t("account:SETTINGS_PROJECT_API_KEYS_DESC_PLACEHOLDER")}
                className="min-h-24"
                disabled={!canManageApiKeys}
              />
              <Button
                type="submit"
                loading={createMutation.isPending}
                disabled={!name.trim() || !canManageApiKeys}
                className="lg:self-start"
              >
                {t("account:SETTINGS_PROJECT_API_KEYS_CREATE_ACTION")}
              </Button>
            </div>
          </form>

          <div className="grid gap-3" data-testid="project-api-keys-settings-list">
            {sortedItems.length > 0 ? (
              sortedItems.map((item) => (
                <ApiKeyRow
                  key={item.id}
                  item={item}
                  reveal={secretReveal}
                  pending={pending || !canManageApiKeys}
                  onCopyMask={(value) => void handleCopyMask(value)}
                  onRotate={(keyId) => void rotateMutation.mutateAsync(keyId)}
                  onRevoke={(keyId) => void revokeMutation.mutateAsync(keyId)}
                  formatDateTime={(value) => formatDateTime(value, { includeTime: true })}
                />
              ))
            ) : (
              <div className="rounded-[28px] border border-dashed border-border/70 bg-background/80 px-5 py-8 text-sm text-muted-foreground">
                {t("account:SETTINGS_PROJECT_API_KEYS_EMPTY")}
              </div>
            )}
          </div>
        </div>
      </div>
    </ContentGuard>
  );

  if (props.embedded) {
    return content;
  }

  return (
    <DefaultPage
      title={t("account:SETTINGS_NAV_PROJECT_API_KEYS")}
      description={t("account:SETTINGS_PROJECT_API_KEYS_DESC")}
      showFavoriteToggle={false}
      pageFrame="full"
      className="min-h-full"
      contentClassName="min-h-full"
      contentContainerClassName="min-h-full"
    >
      {content}
    </DefaultPage>
  );
}
