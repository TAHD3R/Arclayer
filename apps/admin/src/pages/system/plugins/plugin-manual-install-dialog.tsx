import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileArchive, ShieldCheck, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  getSystemPluginOperation,
  installSystemPlugin,
  reviewManualSystemPluginArtifact,
  type SystemPluginArtifactReview,
  type SystemPluginOperation,
} from "@/api/plugins";
import { BaseTag } from "@/components/ui/tags";
import { Button } from "@arclayer/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@arclayer/ui/dialog";
import { Label } from "@arclayer/ui/label";
import { Textarea } from "@arclayer/ui/textarea";

import { isTerminalPluginOperation, PluginOperationStatus } from "./plugin-operation-status";

function errorMessage(error: unknown): string | null {
  return error instanceof Error ? error.message : null;
}

function formatPackageSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ReviewEvidence({ review }: { review: SystemPluginArtifactReview }) {
  const { t } = useTranslation("settings");
  return (
    <div className="space-y-4">
      <section className="rounded-lg border bg-muted/20 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-headline font-semibold text-label-primary">{review.pluginName}</p>
            <p className="mt-1 font-mono text-caption text-label-tertiary">v{review.version}</p>
          </div>
          <BaseTag color={review.compatibility.compatible ? "green" : "red"}>
            {t(
              review.compatibility.compatible
                ? "SETTINGS_SYSTEM_PLUGIN_COMPATIBLE"
                : "SETTINGS_SYSTEM_PLUGIN_STATE_INCOMPATIBLE",
            )}
          </BaseTag>
        </div>
        <dl className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2">
          <div>
            <dt className="text-caption text-label-tertiary">
              {t("SETTINGS_SYSTEM_PLUGIN_MANUAL_PACKAGE_SIZE")}
            </dt>
            <dd className="mt-1 text-footnote">{formatPackageSize(review.sizeBytes)}</dd>
          </div>
          <div>
            <dt className="text-caption text-label-tertiary">
              {t("SETTINGS_SYSTEM_PLUGIN_MANUAL_SIGNATURE")}
            </dt>
            <dd className="mt-1 flex items-center gap-1.5 text-footnote">
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              {t("SETTINGS_SYSTEM_PLUGIN_MANUAL_SIGNATURE_VERIFIED")}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-caption text-label-tertiary">
              {t("SETTINGS_SYSTEM_PLUGIN_PACKAGE_CHECKSUM")}
            </dt>
            <dd className="mt-1 break-all font-mono text-caption">{review.packageChecksum}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-caption text-label-tertiary">
              {t("SETTINGS_SYSTEM_PLUGIN_MANUAL_SIGNER")}
            </dt>
            <dd className="mt-1 break-all font-mono text-caption">{review.signerFingerprint}</dd>
          </div>
        </dl>
      </section>

      <section>
        <h3 className="text-footnote font-semibold text-label-primary">
          {t("SETTINGS_SYSTEM_PLUGIN_PERMISSION_REVIEW_TITLE")}
        </h3>
        <p className="mt-1 text-caption text-label-secondary">
          {t("SETTINGS_SYSTEM_PLUGIN_MANUAL_PERMISSION_DESC")}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {review.permissions.length ? (
            review.permissions.map((permission) => (
              <BaseTag key={permission} color="gold">
                {permission}
              </BaseTag>
            ))
          ) : (
            <span className="text-caption text-label-tertiary">-</span>
          )}
        </div>
      </section>

      {review.compatibility.issues.length ? (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-footnote font-medium text-destructive">
            {t("SETTINGS_SYSTEM_PLUGIN_MANUAL_COMPATIBILITY_BLOCKED")}
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-caption text-label-secondary">
            {review.compatibility.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function PluginManualInstallDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation(["settings", "common"]);
  const queryClient = useQueryClient();
  const [packageFile, setPackageFile] = useState<File | null>(null);
  const [signature, setSignature] = useState("");
  const [review, setReview] = useState<SystemPluginArtifactReview | null>(null);
  const [operation, setOperation] = useState<SystemPluginOperation | null>(null);
  const reviewMutation = useMutation({
    mutationFn: () => {
      if (!packageFile) throw new Error("PLUGIN_PACKAGE_REQUIRED");
      return reviewManualSystemPluginArtifact(packageFile, signature.trim());
    },
    onSuccess: setReview,
  });
  const installMutation = useMutation({
    mutationFn: () => {
      if (!review) throw new Error("PLUGIN_ARTIFACT_REQUIRED");
      return installSystemPlugin(
        {
          sourceType: "manual_upload",
          artifactId: review.id,
          approvedPermissions: review.permissions,
        },
        crypto.randomUUID(),
      );
    },
    onSuccess: setOperation,
  });
  const operationQuery = useQuery({
    queryKey: ["system", "plugin-operations", operation?.id],
    queryFn: ({ signal }) => {
      if (!operation) throw new Error("PLUGIN_OPERATION_TARGET_REQUIRED");
      return getSystemPluginOperation(operation.id, signal);
    },
    enabled: Boolean(operation),
    retry: false,
    refetchInterval: (state) => {
      const current = state.state.data;
      return current &&
        (isTerminalPluginOperation(current) || current.state === "waiting_for_restart")
        ? false
        : 1_500;
    },
  });
  const currentOperation = operationQuery.data ?? operation;
  const pending = reviewMutation.isPending || installMutation.isPending;
  const requestError = reviewMutation.error ?? installMutation.error ?? operationQuery.error;

  useEffect(() => {
    if (!currentOperation) return;
    if (
      !isTerminalPluginOperation(currentOperation) &&
      currentOperation.state !== "waiting_for_restart"
    )
      return;
    void queryClient.invalidateQueries({ queryKey: ["system", "plugins"] });
  }, [currentOperation, queryClient]);

  const reset = () => {
    setPackageFile(null);
    setSignature("");
    setReview(null);
    setOperation(null);
    reviewMutation.reset();
    installMutation.reset();
  };

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open && pending) return;
        props.onOpenChange(open);
        if (!open) reset();
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("settings:SETTINGS_SYSTEM_PLUGIN_MANUAL_TITLE")}</DialogTitle>
          <DialogDescription>{t("settings:SETTINGS_SYSTEM_PLUGIN_MANUAL_DESC")}</DialogDescription>
        </DialogHeader>

        {currentOperation ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-footnote font-medium text-label-primary">
              <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
              {t("settings:SETTINGS_SYSTEM_PLUGIN_MANUAL_OPERATION_CREATED")}
            </div>
            <PluginOperationStatus operation={currentOperation} />
          </div>
        ) : review ? (
          <ReviewEvidence review={review} />
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="plugin-package">
                {t("settings:SETTINGS_SYSTEM_PLUGIN_MANUAL_PACKAGE_LABEL")}
              </Label>
              <label
                htmlFor="plugin-package"
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed bg-muted/15 p-4 transition-colors hover:bg-muted/30"
              >
                <span className="flex size-9 items-center justify-center rounded-md border bg-card">
                  <FileArchive className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-footnote font-medium">
                    {packageFile?.name ??
                      t("settings:SETTINGS_SYSTEM_PLUGIN_MANUAL_PACKAGE_PLACEHOLDER")}
                  </span>
                  <span className="mt-0.5 block text-caption text-label-tertiary">
                    {t("settings:SETTINGS_SYSTEM_PLUGIN_MANUAL_PACKAGE_HELP")}
                  </span>
                </span>
              </label>
              <input
                id="plugin-package"
                type="file"
                accept=".zip,application/zip"
                className="sr-only"
                onChange={(event) => setPackageFile(event.target.files?.[0] ?? null)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plugin-signature">
                {t("settings:SETTINGS_SYSTEM_PLUGIN_MANUAL_SIGNATURE_LABEL")}
              </Label>
              <Textarea
                id="plugin-signature"
                value={signature}
                onChange={(event) => setSignature(event.target.value)}
                maxLength={512}
                rows={4}
                className="font-mono text-caption"
                placeholder={t("settings:SETTINGS_SYSTEM_PLUGIN_MANUAL_SIGNATURE_PLACEHOLDER")}
              />
              <p className="text-caption text-label-tertiary">
                {t("settings:SETTINGS_SYSTEM_PLUGIN_MANUAL_SIGNATURE_HELP")}
              </p>
            </div>
          </div>
        )}

        {requestError ? (
          <p role="alert" className="text-footnote text-destructive">
            {errorMessage(requestError)}
          </p>
        ) : null}

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={pending}>
              {t(currentOperation ? "common:CLOSE" : "common:CANCEL")}
            </Button>
          </DialogClose>
          {!currentOperation && review ? (
            <Button
              type="button"
              loading={installMutation.isPending}
              disabled={!review.compatibility.compatible}
              onClick={() => installMutation.mutate()}
            >
              {t("settings:SETTINGS_SYSTEM_PLUGIN_OPERATION_INSTALL_CONFIRM")}
            </Button>
          ) : null}
          {!currentOperation && !review ? (
            <Button
              type="button"
              loading={reviewMutation.isPending}
              disabled={!packageFile || !signature.trim()}
              onClick={() => reviewMutation.mutate()}
            >
              <Upload data-icon="inline-start" />
              {t("settings:SETTINGS_SYSTEM_PLUGIN_MANUAL_REVIEW_ACTION")}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
