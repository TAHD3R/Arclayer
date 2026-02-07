import { Button, Descriptions, Result, Spin, Switch, Typography } from "antd";
import { CloudUpload, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useTranslation } from "react-i18next";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import type { WorkspacePluginPackageValidateOut } from "@/api/workspace-plugins";
import {
  installValidatedWorkspacePlugin,
  validateWorkspacePluginPackage,
} from "@/api/workspace-plugins";

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "-";
  const units = ["B", "KB", "MB", "GB"] as const;
  let v = bytes;
  let idx = 0;
  while (v >= 1024 && idx < units.length - 1) {
    v /= 1024;
    idx += 1;
  }
  const n = idx === 0 ? String(Math.round(v)) : v.toFixed(v < 10 ? 1 : 0);
  return `${n} ${units[idx]}`;
}

type Step = "pick" | "validating" | "validated" | "installing" | "error";

function categoryLabel(t: (key: string, opts?: { defaultValue?: string }) => string, code: string | null | undefined): string {
  const c = String(code || "").trim().toLowerCase();
  if (!c) return t("common:NA");
  const key = `plugin:PLUGIN_CATEGORY_${c.toUpperCase()}` as const;
  return t(key, { defaultValue: c });
}

export interface PluginInstallDialogProps {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
  defaultEnableInWorkspace?: boolean;
  onInstalled?: (result: { requiresRestart: boolean }) => void;
}

export function PluginInstallDialog({
  workspaceId,
  open,
  onOpenChange,
  disabled = false,
  defaultEnableInWorkspace = true,
  onInstalled,
}: PluginInstallDialogProps) {
  const { t } = useTranslation(["plugin", "common"]);

  const [file, setFile] = useState<File | null>(null);
  const [enableInWorkspace, setEnableInWorkspace] = useState<boolean>(defaultEnableInWorkspace);
  const [step, setStep] = useState<Step>("pick");
  const [validated, setValidated] = useState<WorkspacePluginPackageValidateOut | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const resetState = useCallback(() => {
    setFile(null);
    setEnableInWorkspace(defaultEnableInWorkspace);
    setStep("pick");
    setValidated(null);
    setErrorText(null);
  }, [defaultEnableInWorkspace]);

  useEffect(() => {
    if (!open) resetState();
  }, [open, resetState]);

  const onDrop = useCallback((files: File[]) => {
    const f = files?.[0] ?? null;
    setFile(f);
    setValidated(null);
    setErrorText(null);
    setStep("pick");
  }, []);

  const {
    getRootProps,
    getInputProps,
    isDragActive,
    open: openFileDialog,
  } = useDropzone({
    multiple: false,
    noClick: true,
    onDrop,
    accept: { "application/zip": [".zip"] },
  });

  const canValidate = useMemo(() => Boolean(file && !disabled && step !== "validating" && step !== "installing"), [file, disabled, step]);

  const validateNow = useCallback(async () => {
    if (!file) return;
    setStep("validating");
    setErrorText(null);
    try {
      const res = await validateWorkspacePluginPackage({ workspaceId, file });
      setValidated(res);
      setStep("validated");
      notifySuccessText(t("plugin:PLUGIN_CENTER_VALIDATE_SUCCESS"));
    } catch (err) {
      setValidated(null);
      setStep("error");
      setErrorText(err instanceof Error ? err.message : t("plugin:PLUGIN_CENTER_VALIDATE_FAILED"));
      notifyError(err);
    }
  }, [file, t, workspaceId]);

  const confirmInstall = useCallback(async () => {
    if (!validated) return;
    setStep("installing");
    setErrorText(null);
    try {
      const res = await installValidatedWorkspacePlugin({
        workspaceId,
        token: validated.token,
        enableInWorkspace,
      });
      notifySuccessText(t("plugin:PLUGIN_CENTER_INSTALL_SUCCESS"));
      onOpenChange(false);
      onInstalled?.({ requiresRestart: Boolean(res.requiresRestart) });
    } catch (err) {
      setStep("error");
      setErrorText(err instanceof Error ? err.message : t("plugin:PLUGIN_CENTER_INSTALL_FAILED_GENERIC"));
      notifyError(err);
    }
  }, [enableInWorkspace, onInstalled, onOpenChange, t, validated, workspaceId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className={cn("p-0", "max-w-[min(920px,calc(100vw-2rem))] sm:max-w-[min(920px,calc(100vw-2rem))]")}
      >
        <DialogHeader className="px-5 pt-4 pb-2 border-b">
          <DialogTitle className="font-bold!">{t("plugin:PLUGIN_CENTER_INSTALL_DIALOG_TITLE")}</DialogTitle>
        </DialogHeader>

        <div className="px-5 pt-4 pb-5">
          <div
            {...getRootProps()}
            className={cn(
              "relative rounded-xl border border-dashed",
              "p-8 sm:p-10",
              "transition",
              isDragActive ? "border-primary bg-primary/5" : "border-border/70 hover:border-border",
              disabled ? "opacity-60 pointer-events-none" : "",
            )}
          >
            <input {...getInputProps()} />

            <div className="flex flex-col items-center text-center">
              <CloudUpload className={cn("size-10", isDragActive ? "text-primary" : "text-muted-foreground")} />
              <div className="mt-3 text-base font-medium">{t("plugin:PLUGIN_CENTER_DROP_TITLE")}</div>
              <div className="mt-1 text-sm text-muted-foreground">{t("plugin:PLUGIN_CENTER_DROP_DESC")}</div>

              <div className="mt-4">
                <Button type="primary" disabled={disabled} icon={<Upload className="size-4" />} onClick={() => openFileDialog()}>
                  {t("plugin:PLUGIN_CENTER_PICK_FILE")}
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-start justify-between gap-3 rounded-md border p-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">{t("plugin:PLUGIN_CENTER_FILE_LABEL")}</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {file ? `${file.name} (${formatBytes(file.size)})` : t("plugin:PLUGIN_CENTER_FILE_EMPTY")}
              </div>
            </div>
            <div className="shrink-0">
              <Button disabled={!canValidate} loading={step === "validating"} onClick={() => void validateNow()}>
                {t("plugin:PLUGIN_CENTER_VALIDATE_ACTION")}
              </Button>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between rounded-md border p-3">
            <div className="text-sm">{t("plugin:PLUGIN_CENTER_ENABLE_AFTER_INSTALL")}</div>
            <Switch
              checked={enableInWorkspace}
              aria-label={t("plugin:PLUGIN_CENTER_ENABLE_AFTER_INSTALL")}
              onChange={setEnableInWorkspace}
              disabled={disabled || step === "installing" || step === "validating"}
            />
          </div>

          {step === "validating" ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Spin size="small" />
              {t("plugin:PLUGIN_CENTER_VALIDATING")}
            </div>
          ) : null}

          {(step === "validated" || step === "installing") && validated ? (
            <div className="mt-4">
              <Typography.Title level={5} style={{ marginTop: 0 }}>
                {t("plugin:PLUGIN_CENTER_META_TITLE")}
              </Typography.Title>

              <Descriptions bordered size="small" column={1}>
                <Descriptions.Item label={t("plugin:PLUGIN_META_NAME")}>{validated.meta.name}</Descriptions.Item>
                <Descriptions.Item label={t("plugin:PLUGIN_META_VERSION")}>{validated.meta.version}</Descriptions.Item>
                <Descriptions.Item label={t("plugin:PLUGIN_META_AUTHOR")}>{validated.meta.author}</Descriptions.Item>
                <Descriptions.Item label={t("plugin:PLUGIN_META_ID")}>{validated.meta.pluginId}</Descriptions.Item>
                <Descriptions.Item label={t("plugin:PLUGIN_META_SLUG")}>{validated.meta.slug}</Descriptions.Item>
                <Descriptions.Item label={t("plugin:PLUGIN_META_REQUIRES")}>{validated.meta.requires}</Descriptions.Item>
                <Descriptions.Item label={t("plugin:PLUGIN_META_CATEGORY")}>
                  {categoryLabel(t, validated.meta.category)}
                </Descriptions.Item>
                <Descriptions.Item label={t("plugin:PLUGIN_META_SHA256")}>{validated.sha256}</Descriptions.Item>
                <Descriptions.Item label={t("plugin:PLUGIN_META_SIZE")}>{formatBytes(validated.sizeBytes)}</Descriptions.Item>
              </Descriptions>

              {step === "installing" ? (
                <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                  <Spin size="small" />
                  {t("plugin:PLUGIN_CENTER_INSTALLING")}
                </div>
              ) : null}

              <div className="mt-4 flex items-center justify-end gap-2">
                <Button onClick={() => onOpenChange(false)} disabled={step === "installing"}>
                  {t("common:CANCEL")}
                </Button>
                <Button
                  type="primary"
                  loading={step === "installing"}
                  disabled={step === "installing"}
                  onClick={() => void confirmInstall()}
                >
                  {t("plugin:PLUGIN_CENTER_CONFIRM_INSTALL_ACTION")}
                </Button>
              </div>
            </div>
          ) : null}

          {step === "error" ? (
            <div className="mt-4">
              <Result
                status="error"
                title={t("plugin:PLUGIN_CENTER_OPERATION_FAILED")}
                subTitle={errorText || t("plugin:PLUGIN_CENTER_INSTALL_FAILED_GENERIC")}
                extra={[
                  <Button key="retry" type="primary" disabled={!file || disabled} onClick={() => void validateNow()}>
                    {t("common:RETRY")}
                  </Button>,
                ]}
              />
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
