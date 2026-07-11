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
import { AccessNoticeAlert } from "@/components/common/access-notice-alert";
import { BaseTag } from "@/components/ui/tags";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import { useProjectPermissionAccess } from "@/hooks/use-workspace-permission-access";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { copyToClipboard } from "@/lib/clipboard";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { Button } from "@arclayer/ui/button";
import { Checkbox } from "@arclayer/ui/checkbox";
import { DateTimeField } from "@arclayer/ui/date-time-range-field";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@arclayer/ui/empty";
import { Input } from "@arclayer/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@arclayer/ui/table";
import { Textarea } from "@arclayer/ui/textarea";
import type {
  ApiKeyCreateOut,
  ApiKeyFamily,
  ApiKeyOut,
  ApiKeyScope,
  DeliveryKeyPerspective,
} from "@arclayer/openapi";

const PROJECT_API_KEYS_QUERY_KEY_PREFIX = ["project", "api-keys"] as const;
const DELIVERY_SCOPES = ["delivery.read", "graphql.read"] as const satisfies readonly ApiKeyScope[];
const SERVICE_SCOPES = [
  "content.read",
  "content.write",
  "models.read",
  "models.write",
  "keys.read",
  "keys.write",
  "settings.read",
  "settings.write",
] as const satisfies readonly ApiKeyScope[];

type ProjectKeyFamily = Extract<ApiKeyFamily, "delivery" | "workspace_service">;
type SecretReveal = { keyId: string; secretToken: string };
type Confirmation = { action: "rotate" | "revoke"; key: ApiKeyOut };
type CreateForm = {
  family: ProjectKeyFamily;
  name: string;
  description: string;
  scopes: ApiKeyScope[];
  perspective: DeliveryKeyPerspective;
  expiresAt: string;
};

function newCreateForm(): CreateForm {
  return {
    family: "delivery",
    name: "",
    description: "",
    scopes: ["delivery.read"],
    perspective: "published",
    expiresAt: "",
  };
}

function buildProjectApiKeysQueryKey(projectId: string) {
  return [...PROJECT_API_KEYS_QUERY_KEY_PREFIX, projectId] as const;
}

function isExpired(item: ApiKeyOut) {
  return Boolean(item.expiresAt && new Date(item.expiresAt).getTime() <= Date.now());
}

function ApiKeyFamilyTag({ item }: { item: ApiKeyOut }) {
  const { t } = useTranslation("account");
  return (
    <BaseTag color={item.family === "delivery" ? "blue" : "default"}>
      {item.family === "delivery"
        ? t("SETTINGS_PROJECT_API_KEYS_FAMILY_DELIVERY")
        : t("SETTINGS_PROJECT_API_KEYS_FAMILY_SERVICE")}
    </BaseTag>
  );
}

function ApiKeyStatusTag({ item }: { item: ApiKeyOut }) {
  const { t } = useTranslation("account");
  if (item.revokedAt) {
    return <BaseTag color="default">{t("SETTINGS_PROJECT_API_KEYS_STATUS_REVOKED")}</BaseTag>;
  }
  if (isExpired(item)) {
    return <BaseTag color="gold">{t("SETTINGS_PROJECT_API_KEYS_STATUS_EXPIRED")}</BaseTag>;
  }
  return <BaseTag color="green">{t("SETTINGS_PROJECT_API_KEYS_STATUS_ACTIVE")}</BaseTag>;
}

function SecretRevealPanel(props: {
  reveal: SecretReveal;
  onCopy: (secret: string) => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation(["account", "common"]);
  return (
    <section className="border-y border-border bg-muted/40 px-4 py-4" aria-live="polite">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-background text-label-primary">
            <ShieldCheck aria-hidden="true" size={18} />
          </div>
          <div className="min-w-0">
            <div className="text-headline font-semibold text-label-primary">
              {t("account:SETTINGS_PROJECT_API_KEYS_SECRET_TITLE")}
            </div>
            <div className="text-footnote text-label-secondary">
              {t("account:SETTINGS_PROJECT_API_KEYS_SECRET_DESC")}
            </div>
            <code className="mt-2 block select-all break-all font-mono text-footnote text-label-primary">
              {props.reveal.secretToken}
            </code>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => props.onCopy(props.reveal.secretToken)}
          >
            <Copy aria-hidden="true" />
            {t("account:SETTINGS_PROJECT_API_KEYS_COPY_SECRET")}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={props.onDismiss}>
            {t("common:CLOSE")}
          </Button>
        </div>
      </div>
    </section>
  );
}

type ApiKeysTableProps = {
  items: readonly ApiKeyOut[];
  canManage: boolean;
  pending: boolean;
  formatDateTime: (value: string | null | undefined) => string;
  onConfirm: (confirmation: Confirmation) => void;
};

function ApiKeysTable(props: ApiKeysTableProps) {
  const { t } = useTranslation("account");
  if (props.items.length === 0) return null;

  return (
    <div
      className="overflow-x-auto rounded-lg border border-border"
      data-testid="project-api-keys-settings-list"
    >
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="min-w-64 px-4">{t("SETTINGS_PROJECT_API_KEYS_KEY")}</TableHead>
            <TableHead className="min-w-56">{t("SETTINGS_PROJECT_API_KEYS_SCOPES")}</TableHead>
            <TableHead className="min-w-48">{t("SETTINGS_PROJECT_API_KEYS_MASK")}</TableHead>
            <TableHead className="min-w-52">{t("SETTINGS_PROJECT_API_KEYS_ACTIVITY")}</TableHead>
            <TableHead className="min-w-40 px-4 text-right">
              {t("SETTINGS_PROJECT_API_KEYS_ACTIONS")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {props.items.map((item) => (
            <ApiKeyTableRow key={item.id} item={item} {...props} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ApiKeyTableRow(props: ApiKeysTableProps & { item: ApiKeyOut }) {
  const { t } = useTranslation("account");
  const inactive = Boolean(props.item.revokedAt) || isExpired(props.item);
  return (
    <TableRow data-testid={`project-api-key-row-${props.item.id}`}>
      <TableCell className="px-4 py-4 align-top">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-label-primary">{props.item.name}</span>
          <ApiKeyFamilyTag item={props.item} />
          <ApiKeyStatusTag item={props.item} />
        </div>
        <div className="mt-1 max-w-72 text-footnote text-label-secondary">
          {props.item.description || t("SETTINGS_PROJECT_API_KEYS_DESCRIPTION_EMPTY")}
        </div>
        {props.item.family === "delivery" && props.item.deliveryPerspective ? (
          <div className="mt-2 text-footnote text-label-secondary">
            {t("SETTINGS_PROJECT_API_KEYS_PERSPECTIVE_LABEL")}:{" "}
            {props.item.deliveryPerspective === "preview"
              ? t("SETTINGS_PROJECT_API_KEYS_PERSPECTIVE_PREVIEW")
              : t("SETTINGS_PROJECT_API_KEYS_PERSPECTIVE_PUBLISHED")}
          </div>
        ) : null}
      </TableCell>
      <TableCell className="align-top">
        <div className="flex max-w-72 flex-wrap gap-1.5">
          {(props.item.scopes ?? []).map((scope) => (
            <BaseTag key={scope} color="default">
              {scope}
            </BaseTag>
          ))}
        </div>
      </TableCell>
      <TableCell className="align-top">
        <code className="font-mono text-footnote text-label-primary">{props.item.tokenMask}</code>
        <div className="mt-1 text-footnote text-label-secondary">
          {t("SETTINGS_PROJECT_API_KEYS_CREATED_AT")}: {props.formatDateTime(props.item.createdAt)}
        </div>
      </TableCell>
      <TableCell className="align-top text-footnote">
        <div className="text-label-primary">
          {t("SETTINGS_PROJECT_API_KEYS_LAST_USED")}: {props.formatDateTime(props.item.lastUsedAt)}
        </div>
        <div className="mt-1 text-label-secondary">
          {t("SETTINGS_PROJECT_API_KEYS_EXPIRES_AT")}: {props.formatDateTime(props.item.expiresAt)}
        </div>
        {props.item.revokedAt ? (
          <div className="mt-1 text-label-secondary">
            {t("SETTINGS_PROJECT_API_KEYS_REVOKED_AT_LABEL", {
              value: props.formatDateTime(props.item.revokedAt),
            })}
          </div>
        ) : null}
      </TableCell>
      <TableCell className="px-4 align-top">
        <div className="flex items-center justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("SETTINGS_PROJECT_API_KEYS_ROTATE")}
            disabled={!props.canManage || props.pending || inactive}
            onClick={() => props.onConfirm({ action: "rotate", key: props.item })}
            data-testid={`project-api-key-rotate-${props.item.id}`}
          >
            <RefreshCw aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("SETTINGS_PROJECT_API_KEYS_REVOKE")}
            disabled={!props.canManage || props.pending || inactive}
            onClick={() => props.onConfirm({ action: "revoke", key: props.item })}
            data-testid={`project-api-key-revoke-${props.item.id}`}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function ScopeSelector(props: {
  family: ProjectKeyFamily;
  scopes: readonly ApiKeyScope[];
  onChange: (scope: ApiKeyScope, checked: boolean) => void;
}) {
  const { t } = useTranslation("account");
  const options = props.family === "delivery" ? DELIVERY_SCOPES : SERVICE_SCOPES;
  return (
    <div className="grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-2">
      {options.map((scope) => {
        const inputId = `project-api-key-scope-${scope.replace(".", "-")}`;
        return (
          <label
            key={scope}
            htmlFor={inputId}
            className="flex cursor-pointer items-start gap-3 bg-background px-3 py-3"
          >
            <Checkbox
              id={inputId}
              checked={props.scopes.includes(scope)}
              onCheckedChange={(checked) => props.onChange(scope, Boolean(checked))}
              aria-label={t(
                `SETTINGS_PROJECT_API_KEYS_SCOPE_${scope.replace(".", "_").toUpperCase()}`,
              )}
            />
            <span className="min-w-0">
              <span className="block text-footnote font-medium text-label-primary">{scope}</span>
              <span className="block text-footnote text-label-secondary">
                {t(`SETTINGS_PROJECT_API_KEYS_SCOPE_${scope.replace(".", "_").toUpperCase()}`)}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

export function ProjectApiKeysSettingsPage(props: { projectId: string; embedded?: boolean }) {
  const { t } = useTranslation(["account", "common"]);
  const queryClient = useQueryClient();
  const { formatDateTime } = useAdminDateTimeFormatter({ projectId: props.projectId });
  const permissionAccess = useProjectPermissionAccess(props.projectId);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<CreateForm>(newCreateForm);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [secretReveal, setSecretReveal] = useState<SecretReveal | null>(null);
  const queryKey = buildProjectApiKeysQueryKey(props.projectId);

  const apiKeysQuery = useQuery({
    queryKey,
    enabled: Boolean(props.projectId),
    queryFn: async () => listProjectApiKeys(props.projectId),
  });
  const permissionReady =
    permissionAccess.authzQuery.isFetched && permissionAccess.actionsQuery.isFetched;
  const canManage = permissionReady && permissionAccess.hasAction("project:api-keys:manage");
  const items = useMemo(
    () =>
      [...(apiKeysQuery.data ?? [])].sort((left, right) => {
        if (Boolean(left.revokedAt) !== Boolean(right.revokedAt)) return left.revokedAt ? 1 : -1;
        return right.createdAt.localeCompare(left.createdAt);
      }),
    [apiKeysQuery.data],
  );
  const expiresTimestamp = form.expiresAt ? new Date(form.expiresAt).getTime() : null;
  const expiryInvalid =
    expiresTimestamp !== null &&
    (!Number.isFinite(expiresTimestamp) || expiresTimestamp <= Date.now());
  const canCreate =
    canManage && Boolean(form.name.trim()) && form.scopes.length > 0 && !expiryInvalid;

  const invalidate = async () => queryClient.invalidateQueries({ queryKey });
  const showSecret = (result: ApiKeyCreateOut) => {
    setSecretReveal({ keyId: result.key.id, secretToken: result.secretToken });
  };
  const createMutation = useMutation({
    mutationFn: async () =>
      createProjectApiKey(props.projectId, {
        family: form.family,
        name: form.name.trim(),
        description: form.description.trim() || null,
        scopes: form.scopes,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
        deliveryPerspective: form.family === "delivery" ? form.perspective : null,
      }),
    onSuccess: async (result: ApiKeyCreateOut) => {
      showSecret(result);
      setCreateOpen(false);
      setForm(newCreateForm());
      notifySuccessText(t("account:SETTINGS_PROJECT_API_KEYS_CREATED"));
      await invalidate();
    },
    onError: notifyError,
  });
  const rotateMutation = useMutation({
    mutationFn: async (keyId: string) => rotateProjectApiKey(props.projectId, keyId),
    onSuccess: async (result: ApiKeyCreateOut) => {
      showSecret(result);
      setConfirmation(null);
      notifySuccessText(t("account:SETTINGS_PROJECT_API_KEYS_ROTATED"));
      await invalidate();
    },
    onError: notifyError,
  });
  const revokeMutation = useMutation({
    mutationFn: async (keyId: string) => revokeProjectApiKey(props.projectId, keyId),
    onSuccess: async () => {
      setConfirmation(null);
      notifySuccessText(t("account:SETTINGS_PROJECT_API_KEYS_REVOKED"));
      await invalidate();
    },
    onError: notifyError,
  });
  const pending = createMutation.isPending || rotateMutation.isPending || revokeMutation.isPending;

  const openCreate = () => {
    setForm(newCreateForm());
    setCreateOpen(true);
  };
  const createButton = canManage ? (
    <Button type="button" onClick={openCreate} data-testid="project-api-key-create-trigger">
      {t("account:SETTINGS_PROJECT_API_KEYS_CREATE_ACTION")}
    </Button>
  ) : null;
  const copySecret = async (secret: string) => {
    try {
      await copyToClipboard(secret);
      notifySuccessText(t("account:SETTINGS_PROJECT_API_KEYS_SECRET_COPIED"));
    } catch (error) {
      notifyError(error);
    }
  };

  const content = (
    <ContentGuard
      loading={apiKeysQuery.isLoading}
      loadingVariant="table"
      error={apiKeysQuery.error}
      onRetry={apiKeysQuery.isError ? () => void apiKeysQuery.refetch() : undefined}
    >
      <div className="grid gap-4">
        <div className="flex flex-col gap-3 border-y border-border py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-footnote text-label-secondary">
              {t("account:SETTINGS_PROJECT_API_KEYS_INVENTORY")}
            </div>
            <div className="text-title3 font-semibold text-label-primary">
              {t("account:SETTINGS_PROJECT_API_KEYS_COUNT", { count: items.length })}
            </div>
          </div>
          {createButton}
        </div>
        {permissionReady && !canManage ? (
          <AccessNoticeAlert
            data-testid="project-api-keys-read-only-notice"
            description={t("account:SETTINGS_PROJECT_READ_ONLY_DESC")}
          />
        ) : null}
        {secretReveal ? (
          <SecretRevealPanel
            reveal={secretReveal}
            onCopy={(value) => void copySecret(value)}
            onDismiss={() => setSecretReveal(null)}
          />
        ) : null}
        {permissionReady && items.length === 0 ? (
          <Empty className="min-h-64" data-testid="project-api-keys-settings-list">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <KeyRound />
              </EmptyMedia>
              <EmptyTitle>{t("account:SETTINGS_PROJECT_API_KEYS_EMPTY")}</EmptyTitle>
              <EmptyDescription>
                {t("account:SETTINGS_PROJECT_API_KEYS_EMPTY_DESC")}
              </EmptyDescription>
            </EmptyHeader>
            {createButton ? <EmptyContent>{createButton}</EmptyContent> : null}
          </Empty>
        ) : (
          <ApiKeysTable
            items={items}
            canManage={canManage}
            pending={pending}
            formatDateTime={(value) => formatDateTime(value, { includeTime: true })}
            onConfirm={setConfirmation}
          />
        )}
      </div>
    </ContentGuard>
  );

  return (
    <>
      {props.embedded ? (
        content
      ) : (
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
      )}

      <SettingDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        preventInitialFocus={false}
        title={t("account:SETTINGS_PROJECT_API_KEYS_CREATE_TITLE")}
        description={t("account:SETTINGS_PROJECT_API_KEYS_CREATE_DESC")}
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={createMutation.isPending}
              onClick={() => setCreateOpen(false)}
            >
              {t("common:CANCEL")}
            </Button>
            <Button
              type="button"
              loading={createMutation.isPending}
              disabled={!canCreate}
              onClick={() => void createMutation.mutateAsync()}
              data-testid="project-api-key-create-submit"
            >
              {t("account:SETTINGS_PROJECT_API_KEYS_CREATE_ACTION")}
            </Button>
          </div>
        }
      >
        <SettingDialogFields>
          <SettingDialogField
            title={t("account:SETTINGS_PROJECT_API_KEYS_FAMILY_LABEL")}
            description={t("account:SETTINGS_PROJECT_API_KEYS_FAMILY_DESC")}
          >
            <Select
              value={form.family}
              onValueChange={(value) => {
                const family = value as ProjectKeyFamily;
                setForm((current) => ({
                  ...current,
                  family,
                  scopes: family === "delivery" ? ["delivery.read"] : ["content.read"],
                }));
              }}
            >
              <SelectTrigger
                id="project-api-key-family"
                className="w-full"
                aria-label={t("account:SETTINGS_PROJECT_API_KEYS_FAMILY_LABEL")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value="delivery">
                  {t("account:SETTINGS_PROJECT_API_KEYS_FAMILY_DELIVERY")}
                </SelectItem>
                <SelectItem value="workspace_service">
                  {t("account:SETTINGS_PROJECT_API_KEYS_FAMILY_SERVICE")}
                </SelectItem>
              </SelectContent>
            </Select>
          </SettingDialogField>
          <SettingDialogField title={t("account:SETTINGS_PROJECT_API_KEYS_NAME")}>
            <Input
              id="project-api-key-name"
              name="name"
              aria-label={t("account:SETTINGS_PROJECT_API_KEYS_NAME")}
              value={form.name}
              maxLength={128}
              autoComplete="off"
              placeholder={t("account:SETTINGS_PROJECT_API_KEYS_NAME_PLACEHOLDER")}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
          </SettingDialogField>
          <SettingDialogField
            title={t("account:SETTINGS_PROJECT_API_KEYS_DESCRIPTION")}
            description={t("account:SETTINGS_PROJECT_API_KEYS_DESCRIPTION_DESC")}
          >
            <Textarea
              id="project-api-key-description"
              name="description"
              aria-label={t("account:SETTINGS_PROJECT_API_KEYS_DESCRIPTION")}
              value={form.description}
              maxLength={512}
              className="min-h-20"
              placeholder={t("account:SETTINGS_PROJECT_API_KEYS_DESC_PLACEHOLDER")}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
            />
          </SettingDialogField>
          <SettingDialogField
            title={t("account:SETTINGS_PROJECT_API_KEYS_SCOPES")}
            description={t("account:SETTINGS_PROJECT_API_KEYS_SCOPES_DESC")}
            error={
              form.scopes.length === 0
                ? t("account:SETTINGS_PROJECT_API_KEYS_SCOPES_REQUIRED")
                : undefined
            }
          >
            <ScopeSelector
              family={form.family}
              scopes={form.scopes}
              onChange={(scope, checked) =>
                setForm((current) => ({
                  ...current,
                  scopes: checked
                    ? [...current.scopes, scope]
                    : current.scopes.filter((value) => value !== scope),
                }))
              }
            />
          </SettingDialogField>
          {form.family === "delivery" ? (
            <SettingDialogField
              title={t("account:SETTINGS_PROJECT_API_KEYS_PERSPECTIVE_LABEL")}
              description={t("account:SETTINGS_PROJECT_API_KEYS_PERSPECTIVE_DESC")}
            >
              <Select
                value={form.perspective}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    perspective: value as DeliveryKeyPerspective,
                  }))
                }
              >
                <SelectTrigger
                  id="project-api-key-perspective"
                  className="w-full"
                  aria-label={t("account:SETTINGS_PROJECT_API_KEYS_PERSPECTIVE_LABEL")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="published">
                    {t("account:SETTINGS_PROJECT_API_KEYS_PERSPECTIVE_PUBLISHED")}
                  </SelectItem>
                  <SelectItem value="preview">
                    {t("account:SETTINGS_PROJECT_API_KEYS_PERSPECTIVE_PREVIEW")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </SettingDialogField>
          ) : null}
          <SettingDialogField
            title={t("account:SETTINGS_PROJECT_API_KEYS_EXPIRES_AT")}
            description={t("account:SETTINGS_PROJECT_API_KEYS_EXPIRES_DESC")}
            error={
              expiryInvalid ? t("account:SETTINGS_PROJECT_API_KEYS_EXPIRES_INVALID") : undefined
            }
          >
            <DateTimeField
              id="project-api-key-expires-at"
              name="expiresAt"
              ariaLabel={t("account:SETTINGS_PROJECT_API_KEYS_EXPIRES_AT")}
              value={form.expiresAt}
              onChange={(value) => setForm((current) => ({ ...current, expiresAt: value ?? "" }))}
            />
          </SettingDialogField>
        </SettingDialogFields>
      </SettingDialog>

      <SettingDialog
        open={Boolean(confirmation)}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null);
        }}
        preventInitialFocus={false}
        title={
          confirmation?.action === "rotate"
            ? t("account:SETTINGS_PROJECT_API_KEYS_ROTATE_CONFIRM_TITLE")
            : t("account:SETTINGS_PROJECT_API_KEYS_REVOKE_CONFIRM_TITLE")
        }
        description={
          confirmation
            ? t(
                confirmation.action === "rotate"
                  ? "account:SETTINGS_PROJECT_API_KEYS_ROTATE_CONFIRM_DESC"
                  : "account:SETTINGS_PROJECT_API_KEYS_REVOKE_CONFIRM_DESC",
                { name: confirmation.key.name },
              )
            : undefined
        }
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => setConfirmation(null)}
            >
              {t("common:CANCEL")}
            </Button>
            <Button
              type="button"
              variant={confirmation?.action === "revoke" ? "destructive" : "default"}
              loading={rotateMutation.isPending || revokeMutation.isPending}
              disabled={!confirmation}
              data-testid="project-api-key-confirm-submit"
              onClick={() => {
                if (!confirmation) return;
                if (confirmation.action === "rotate")
                  void rotateMutation.mutateAsync(confirmation.key.id);
                else void revokeMutation.mutateAsync(confirmation.key.id);
              }}
            >
              {confirmation?.action === "rotate"
                ? t("account:SETTINGS_PROJECT_API_KEYS_ROTATE")
                : t("account:SETTINGS_PROJECT_API_KEYS_REVOKE")}
            </Button>
          </div>
        }
      >
        <div className="border-y border-border py-3">
          <div className="text-footnote text-label-secondary">
            {t("account:SETTINGS_PROJECT_API_KEYS_KEY")}
          </div>
          <div className="mt-1 font-medium text-label-primary">{confirmation?.key.name}</div>
          <code className="mt-1 block font-mono text-footnote text-label-secondary">
            {confirmation?.key.tokenMask}
          </code>
        </div>
      </SettingDialog>
    </>
  );
}
