import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  SystemPluginCatalogItemOut,
  SystemPluginLifecycleRequest,
  SystemPluginOperationOut,
} from "@arclayer/platform-openapi";

import {
  disableExtension,
  enableExtension,
  installExtension,
  recoverExtension,
  removeExtension,
  rollbackExtension,
  upgradeExtension,
} from "@/extensions/extensions-api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SettingDialog } from "@/components/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@/components/setting-dialog-field";

type ReviewAction = "install" | "upgrade" | "enable";
type LifecycleAction = ReviewAction | "disable" | "recover" | "rollback" | "remove";

type OperationCreated = (operation: SystemPluginOperationOut) => void;
type OperationRequest = Readonly<{
  approvedPermissions: string[];
  fingerprint: string;
  idempotencyKey: string;
}>;

function outstandingPermissions(item: SystemPluginCatalogItemOut): string[] {
  const approved = new Set(item.approvedPermissions ?? []);
  return (item.permissions ?? []).filter((permission) => !approved.has(permission));
}

function errorDetails(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function operationRequest(
  idempotencyKeys: Map<string, string>,
  item: SystemPluginCatalogItemOut,
  action: LifecycleAction,
  approvedPermissions: readonly string[],
): OperationRequest {
  const normalizedPermissions = [...new Set(approvedPermissions)].sort();
  const fingerprint = JSON.stringify({
    action,
    approvedPermissions: normalizedPermissions,
    extension: item.name,
    sourceType: action === "install" ? item.sourceType : undefined,
    targetVersion: action === "install" || action === "upgrade" ? item.availableVersion : undefined,
  });
  const existingKey = idempotencyKeys.get(fingerprint);
  if (existingKey) {
    return { approvedPermissions: normalizedPermissions, fingerprint, idempotencyKey: existingKey };
  }
  const idempotencyKey = crypto.randomUUID();
  idempotencyKeys.set(fingerprint, idempotencyKey);
  return { approvedPermissions: normalizedPermissions, fingerprint, idempotencyKey };
}

function PermissionReviewDialog({
  action,
  item,
  open,
  pending,
  error,
  onConfirm,
  onOpenChange,
}: Readonly<{
  action: ReviewAction;
  item: SystemPluginCatalogItemOut;
  open: boolean;
  pending: boolean;
  error: unknown;
  onConfirm: (approvedPermissions: string[]) => void;
  onOpenChange: (open: boolean) => void;
}>) {
  const { t } = useTranslation("extensions");
  const [approved, setApproved] = useState<ReadonlySet<string>>(new Set());
  const outstanding = outstandingPermissions(item);
  const reviewed = outstanding.every((permission) => approved.has(permission));

  useEffect(() => {
    if (open) setApproved(new Set());
  }, [item.name, open]);

  return (
    <SettingDialog
      description={t("PERMISSION_REVIEW_DESCRIPTION", {
        action: t(action.toUpperCase()),
        extension: item.name,
      })}
      footer={
        <>
          <Button disabled={pending} onClick={() => onOpenChange(false)} variant="outline">
            {t("CANCEL")}
          </Button>
          <Button disabled={pending || !reviewed} onClick={() => onConfirm([...approved])}>
            {pending ? t("OPERATION_SUBMITTING") : t("PERMISSION_REVIEW_CONFIRM")}
          </Button>
        </>
      }
      onOpenChange={(nextOpen) => !pending && onOpenChange(nextOpen)}
      open={open}
      title={t("PERMISSION_REVIEW_TITLE", { extension: item.name })}
    >
      <SettingDialogFields>
        {error !== undefined ? (
          <p role="alert">
            {t("OPERATION_ERROR_DETAILS")}: {errorDetails(error)}
          </p>
        ) : null}
        <SettingDialogField
          description={t("PERMISSION_REVIEW_HELP")}
          title={t("PERMISSION_REVIEW_REQUIRED")}
        >
          {outstanding.length === 0 ? (
            <p className="text-base text-muted-foreground">{t("PERMISSION_REVIEW_NONE")}</p>
          ) : (
            <div className="space-y-2 rounded-lg border p-3">
              {outstanding.map((permission) => (
                <label className="flex items-start gap-3" key={permission}>
                  <Checkbox
                    checked={approved.has(permission)}
                    onCheckedChange={(checked) =>
                      setApproved((current) => {
                        const next = new Set(current);
                        if (checked) next.add(permission);
                        else next.delete(permission);
                        return next;
                      })
                    }
                  />
                  <code className="pt-0.5 text-sm">{permission}</code>
                </label>
              ))}
            </div>
          )}
        </SettingDialogField>
      </SettingDialogFields>
    </SettingDialog>
  );
}

function RemoveExtensionDialog({
  item,
  open,
  pending,
  error,
  onConfirm,
  onOpenChange,
}: Readonly<{
  item: SystemPluginCatalogItemOut;
  open: boolean;
  pending: boolean;
  error: unknown;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}>) {
  const { t } = useTranslation("extensions");
  return (
    <SettingDialog
      description={t("REMOVE_CONFIRMATION")}
      footer={
        <>
          <Button disabled={pending} onClick={() => onOpenChange(false)} variant="outline">
            {t("CANCEL")}
          </Button>
          <Button disabled={pending} onClick={onConfirm} variant="destructive">
            {pending ? t("OPERATION_SUBMITTING") : t("REMOVE")}
          </Button>
        </>
      }
      onOpenChange={(nextOpen) => !pending && onOpenChange(nextOpen)}
      open={open}
      title={t("REMOVE_TITLE", { extension: item.name })}
    >
      <SettingDialogFields>
        {error !== undefined ? (
          <p role="alert">
            {t("OPERATION_ERROR_DETAILS")}: {errorDetails(error)}
          </p>
        ) : null}
        <p className="text-base text-muted-foreground">{t("REMOVE_REVIEW_HELP")}</p>
      </SettingDialogFields>
    </SettingDialog>
  );
}

export function ExtensionInstallDialog({
  item,
  open,
  onOpenChange,
  onOperationCreated,
}: Readonly<{
  item: SystemPluginCatalogItemOut;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOperationCreated: OperationCreated;
}>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  const idempotencyKeys = useRef(new Map<string, string>());
  const submit = async (approvedPermissions: string[]) => {
    const request = operationRequest(idempotencyKeys.current, item, "install", approvedPermissions);
    setPending(true);
    setError(undefined);
    try {
      const operation = await installExtension(
        {
          pluginName: item.name,
          sourceType: item.sourceType,
          targetVersion: item.availableVersion,
          approvedPermissions: request.approvedPermissions,
        },
        request.idempotencyKey,
      );
      idempotencyKeys.current.delete(request.fingerprint);
      onOperationCreated(operation);
      onOpenChange(false);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  };
  return (
    <PermissionReviewDialog
      action="install"
      error={error}
      item={item}
      onConfirm={(approvedPermissions) => void submit(approvedPermissions)}
      onOpenChange={onOpenChange}
      open={open}
      pending={pending}
    />
  );
}

export function ExtensionLifecycleActions({
  item,
  onOperationCreated,
}: Readonly<{ item: SystemPluginCatalogItemOut; onOperationCreated: OperationCreated }>) {
  const { t } = useTranslation("extensions");
  const [reviewAction, setReviewAction] = useState<ReviewAction | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [pending, setPending] = useState<LifecycleAction | null>(null);
  const [error, setError] = useState<unknown>();
  const [latestOperation, setLatestOperation] = useState<SystemPluginOperationOut>();
  const idempotencyKeys = useRef(new Map<string, string>());

  const run = async (action: LifecycleAction, approvedPermissions: string[] = []) => {
    const request = operationRequest(idempotencyKeys.current, item, action, approvedPermissions);
    setPending(action);
    setError(undefined);
    try {
      const operation = await lifecycleOperation(
        item,
        action,
        request.approvedPermissions,
        request.idempotencyKey,
      );
      idempotencyKeys.current.delete(request.fingerprint);
      setLatestOperation(operation);
      onOperationCreated(operation);
      setReviewAction(null);
      setRemoveOpen(false);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(null);
    }
  };
  const requiresReview = () => outstandingPermissions(item).length > 0;
  const startReviewable = (action: ReviewAction) => {
    if (requiresReview()) setReviewAction(action);
    else void run(action);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {item.desiredEnabled === false ? (
          <Button
            loading={pending === "enable"}
            onClick={() => startReviewable("enable")}
            size="sm"
            variant="outline"
          >
            {t("ENABLE")}
          </Button>
        ) : null}
        {item.desiredEnabled === true ? (
          <Button
            loading={pending === "disable"}
            onClick={() => void run("disable")}
            size="sm"
            variant="outline"
          >
            {t("DISABLE")}
          </Button>
        ) : null}
        {item.hasUpdate ? (
          <Button
            loading={pending === "upgrade"}
            onClick={() => startReviewable("upgrade")}
            size="sm"
            variant="outline"
          >
            {t("UPDATE")}
          </Button>
        ) : null}
        {item.lifecycleState === "failed" ? (
          <Button
            loading={pending === "recover"}
            onClick={() => void run("recover")}
            size="sm"
            variant="outline"
          >
            {t("RECOVER")}
          </Button>
        ) : null}
        {item.installedVersion ? (
          <Button
            loading={pending === "rollback"}
            onClick={() => void run("rollback")}
            size="sm"
            variant="outline"
          >
            {t("ROLLBACK")}
          </Button>
        ) : null}
        {item.installedVersion ? (
          <Button
            loading={pending === "remove"}
            onClick={() => setRemoveOpen(true)}
            size="sm"
            variant="destructive"
          >
            {t("REMOVE")}
          </Button>
        ) : null}
      </div>
      {error !== undefined && reviewAction === null && !removeOpen ? (
        <p className="text-sm text-destructive" role="alert">
          {t("OPERATION_REQUEST_UNCONFIRMED")} {t("OPERATION_ERROR_DETAILS")}: {errorDetails(error)}
        </p>
      ) : null}
      {latestOperation ? (
        <div
          className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3"
          role="status"
        >
          <span className="text-sm text-muted-foreground">{t("OPERATION_TRACKING")}</span>
          <Link
            className="text-sm font-medium text-primary underline"
            search={{ operationId: latestOperation.id }}
            to="/extensions/history"
          >
            {t("INSPECT_OPERATION")}
          </Link>
        </div>
      ) : null}
      {reviewAction ? (
        <PermissionReviewDialog
          action={reviewAction}
          error={error}
          item={item}
          onConfirm={(approvedPermissions) => void run(reviewAction, approvedPermissions)}
          onOpenChange={(open) => !open && setReviewAction(null)}
          open
          pending={pending === reviewAction}
        />
      ) : null}
      {removeOpen ? (
        <RemoveExtensionDialog
          error={error}
          item={item}
          onConfirm={() => void run("remove")}
          onOpenChange={(open) => !open && setRemoveOpen(false)}
          open
          pending={pending === "remove"}
        />
      ) : null}
    </div>
  );
}

async function lifecycleOperation(
  item: SystemPluginCatalogItemOut,
  action: LifecycleAction,
  approvedPermissions: string[],
  idempotencyKey: string,
): Promise<SystemPluginOperationOut> {
  const emptyRequest: SystemPluginLifecycleRequest = {};
  if (action === "enable") {
    return enableExtension(item.name, { approvedPermissions }, idempotencyKey);
  }
  if (action === "disable") return disableExtension(item.name, emptyRequest, idempotencyKey);
  if (action === "upgrade") {
    return upgradeExtension(
      item.name,
      { targetVersion: item.availableVersion, approvedPermissions },
      idempotencyKey,
    );
  }
  if (action === "recover") return recoverExtension(item.name, emptyRequest, idempotencyKey);
  if (action === "rollback") return rollbackExtension(item.name, emptyRequest, idempotencyKey);
  return removeExtension(item.name, emptyRequest, idempotencyKey);
}
