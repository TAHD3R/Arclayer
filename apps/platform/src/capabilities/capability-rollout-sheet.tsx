import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  PlatformCapabilityOut,
  WorkspaceCapabilityRolloutPreview,
  WorkspaceCapabilityRolloutStage,
} from "@arclayer/platform-openapi";

import { listTenantWorkspaces } from "@/api/tenant-directory";
import {
  applyCapabilityRollout,
  PlatformCapabilityCatalogApiError,
  previewCapabilityRollout,
} from "@/capabilities/catalog-api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

const STAGES: readonly { value: WorkspaceCapabilityRolloutStage; labelKey: string }[] = [
  { value: "all_eligible", labelKey: "ROLLOUT_STAGE_ALL_ELIGIBLE" },
  { value: "selected_workspaces", labelKey: "ROLLOUT_STAGE_SELECTED" },
  { value: "not_available", labelKey: "ROLLOUT_STAGE_NOT_AVAILABLE" },
];

type WorkspaceOption = Readonly<{ id: string; name: string }>;

export function CapabilityRolloutSheet(props: {
  capability: PlatformCapabilityOut;
  onClose: () => void;
  onApplied: () => void;
}) {
  const { t } = useTranslation("overview");
  const [stage, setStage] = useState<WorkspaceCapabilityRolloutStage>("all_eligible");
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [preview, setPreview] = useState<WorkspaceCapabilityRolloutPreview | null>(null);
  const [previewPending, setPreviewPending] = useState(false);
  const [reason, setReason] = useState("");
  const [applyPending, setApplyPending] = useState(false);
  const [appliedRevision, setAppliedRevision] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const applyAttempt = useRef<{ fingerprint: string; key: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    listTenantWorkspaces({ page: 1, size: 100 })
      .then((page) => {
        if (cancelled) return;
        setWorkspaces(
          (page.items ?? [])
            .filter((item) => item.isActive && !item.isArchived)
            .map((item) => ({ id: item.workspaceId, name: item.name })),
        );
      })
      .catch(() => setWorkspaces([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const createPreview = async () => {
    setPreviewPending(true);
    setError(null);
    setAppliedRevision(null);
    try {
      setPreview(
        await previewCapabilityRollout(props.capability.capabilityId, {
          proposedStage: stage,
          ...(stage === "selected_workspaces" ? { selectedWorkspaceIds: [...selectedIds] } : {}),
        }),
      );
    } catch (cause) {
      setError(rolloutError(t, cause));
    } finally {
      setPreviewPending(false);
    }
  };

  const apply = async () => {
    if (!preview) return;
    const normalizedReason = reason.trim();
    if (!normalizedReason) {
      setError(t("ROLLOUT_REASON_REQUIRED"));
      return;
    }
    const fingerprint = JSON.stringify([preview.id, normalizedReason]);
    if (applyAttempt.current?.fingerprint !== fingerprint) {
      applyAttempt.current = { fingerprint, key: crypto.randomUUID() };
    }
    setApplyPending(true);
    setError(null);
    try {
      const receipt = await applyCapabilityRollout({
        previewId: preview.id,
        reason: normalizedReason,
        idempotencyKey: applyAttempt.current.key,
      });
      applyAttempt.current = null;
      setAppliedRevision(receipt.rolloutRevision);
      props.onApplied();
    } catch (cause) {
      setError(rolloutError(t, cause));
    } finally {
      setApplyPending(false);
    }
  };

  const toggleWorkspace = (id: string, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
    setPreview(null);
  };

  return (
    <Sheet onOpenChange={(open) => !open && !applyPending && props.onClose()} open>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{t("ROLLOUT_TITLE", { name: t(props.capability.nameI18nKey) })}</SheetTitle>
          <SheetDescription>{t("ROLLOUT_DESCRIPTION")}</SheetDescription>
        </SheetHeader>
        <div className="grid gap-5 px-6 pb-8">
          {appliedRevision !== null ? (
            <>
              <Alert>
                <AlertTitle>{t("ROLLOUT_APPLIED_TITLE")}</AlertTitle>
                <AlertDescription>
                  {t("ROLLOUT_APPLIED_DESCRIPTION", { revision: appliedRevision })}
                </AlertDescription>
              </Alert>
              <Button onClick={props.onClose} variant="outline">
                {t("ROLLOUT_DONE")}
              </Button>
            </>
          ) : (
            <>
              <div className="grid gap-2">
                <Label htmlFor="rollout-stage">{t("ROLLOUT_STAGE")}</Label>
                <Select
                  onValueChange={(value) => {
                    setStage(value as WorkspaceCapabilityRolloutStage);
                    setPreview(null);
                  }}
                  value={stage}
                >
                  <SelectTrigger id="rollout-stage">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGES.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {t(option.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {stage === "selected_workspaces" ? (
                <div className="grid gap-2">
                  <Label>{t("ROLLOUT_WORKSPACES")}</Label>
                  {workspaces === null ? (
                    <Skeleton className="h-40 w-full" />
                  ) : workspaces.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("ROLLOUT_NO_WORKSPACES")}</p>
                  ) : (
                    <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border p-3">
                      {workspaces.map((workspace) => (
                        <label className="flex items-center gap-2 text-sm" key={workspace.id}>
                          <Checkbox
                            checked={selectedIds.has(workspace.id)}
                            onCheckedChange={(checked) =>
                              toggleWorkspace(workspace.id, checked === true)
                            }
                          />
                          <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {workspace.id.slice(0, 8)}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {t("ROLLOUT_SELECTED_COUNT", { count: selectedIds.size })}
                  </p>
                </div>
              ) : null}

              <Button
                disabled={
                  previewPending ||
                  (stage === "selected_workspaces" && selectedIds.size === 0) ||
                  (stage === "selected_workspaces" && workspaces === null)
                }
                onClick={() => void createPreview()}
              >
                {previewPending ? t("ROLLOUT_PREVIEWING") : t("ROLLOUT_PREVIEW")}
              </Button>

              {preview ? (
                <div className="grid gap-3 rounded-lg border bg-card p-4">
                  <p className="font-medium">{t("ROLLOUT_PREVIEW_SUMMARY")}</p>
                  <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                    <PreviewStat
                      label={t("ROLLOUT_AFFECTED")}
                      value={preview.summary.affectedWorkspaceCount}
                    />
                    <PreviewStat
                      label={t("ROLLOUT_ELIGIBLE")}
                      value={preview.summary.eligibleWorkspaceCount}
                    />
                    <PreviewStat
                      label={t("ROLLOUT_NEWLY_AVAILABLE")}
                      value={preview.summary.newlyAvailableWorkspaceIds.length}
                    />
                    <PreviewStat
                      label={t("ROLLOUT_NO_LONGER_AVAILABLE")}
                      value={preview.summary.noLongerAvailableWorkspaceIds.length}
                    />
                    <PreviewStat
                      label={t("ROLLOUT_BLOCKED")}
                      value={preview.summary.blockedWorkspaceCount}
                    />
                    <PreviewStat
                      label={t("ROLLOUT_SELECTED_COUNT", {
                        count: preview.summary.selectedWorkspaceCount,
                      })}
                      value={preview.summary.selectedWorkspaceCount}
                    />
                  </dl>
                  {preview.operationalConsequences.length > 0 ? (
                    <p className="font-mono text-xs text-muted-foreground">
                      {preview.operationalConsequences.map((item) => item.code).join(" · ")}
                    </p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {t("ROLLOUT_EXPIRES_AT", {
                      time: new Date(preview.expiresAt).toLocaleString(),
                    })}
                  </p>
                </div>
              ) : null}

              {preview ? (
                <div className="grid gap-2">
                  <Label htmlFor="rollout-reason">{t("ROLLOUT_REASON")}</Label>
                  <Textarea
                    id="rollout-reason"
                    onChange={(event) => setReason(event.target.value)}
                    rows={2}
                    value={reason}
                  />
                  <Button disabled={applyPending || !reason.trim()} onClick={() => void apply()}>
                    {applyPending ? t("ROLLOUT_APPLYING") : t("ROLLOUT_APPLY")}
                  </Button>
                </div>
              ) : null}

              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function PreviewStat({ label, value }: Readonly<{ label: string; value: number }>) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function rolloutError(t: (key: string) => string, cause: unknown): string {
  if (cause instanceof PlatformCapabilityCatalogApiError) {
    return `${t("ROLLOUT_FAILED")} (${cause.code})`;
  }
  return t("ROLLOUT_FAILED");
}
