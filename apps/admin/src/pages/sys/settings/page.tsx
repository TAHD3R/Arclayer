import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { ChevronDownIcon } from "lucide-react";
import { SysRevisionActiveTag } from "@/components/ui/tags";

import {
  activateSysConfigRevision,
  getSysConfigNamespace,
  listSysConfigNamespaces,
  listSysConfigRevisions,
  patchSysConfigNamespace,
  sysStepUp,
  testSysConfigRevision,
} from "@/api/sys";
import { RouterDefaultError } from "@/components/builtin/router-fallbacks";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@arclayer/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { ApiError } from "@/lib/http";
import { notifyError } from "@/lib/notifications";
import { cn } from "@arclayer/lib/utils";
import { systemRuntimeQueryKey } from "@/lib/extensions/query-keys";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import { useSysAuthStore } from "@/stores/use-sys-auth-store";
import type { SysConfigDetail, SysConfigNamespaceSummary, SysConfigTestCheck } from "@/types/api";
import { ExtensionSettingsForm } from "@/pages/sys/settings/components/extension-settings-form";

function isStepUpRequired(error: unknown): boolean {
  return error instanceof ApiError && error.error === "SYS_STEP_UP_REQUIRED";
}

function isSuperAdminRequired(error: unknown): boolean {
  return error instanceof ApiError && error.error === "SUPER_ADMIN_REQUIRED";
}

export function SysSettingsPage() {
  const { t } = useTranslation(["sys", "settings", "common"]);
  const dateTime = useAdminDateTimeFormatter({ workspaceId: null });
  const navigate = useNavigate();
  const { namespace } = useParams({ from: "/sys/settings/$namespace/" });
  const queryClient = useQueryClient();

  const hasValidSysToken = useSysAuthStore((s) => s.hasValidSysToken());
  const sysSessionVersion = useSysAuthStore((s) => s.sysSessionVersion);
  const setSysToken = useSysAuthStore((s) => s.setSysToken);
  const clearSysToken = useSysAuthStore((s) => s.clearSysToken);

  const [stepOpen, setStepOpen] = useState<boolean>(!hasValidSysToken);
  const [password, setPassword] = useState<string>("");

  const [lastDraftRevisionId, setLastDraftRevisionId] = useState<string | null>(null);
  const [lastTestChecks, setLastTestChecks] = useState<SysConfigTestCheck[] | null>(null);

  const namespaceId = String(namespace || "").trim() || "storage";

  useEffect(() => {
    setLastDraftRevisionId(null);
    setLastTestChecks(null);
  }, [namespaceId]);

  const stepUpMutation = useMutation({
    mutationFn: async () => {
      const pwd = password.trim();
      return await sysStepUp({ password: pwd });
    },
    onSuccess: (out) => {
      setSysToken(out.token, out.expiresIn);
      setStepOpen(false);
      setPassword("");
      void queryClient.invalidateQueries({ queryKey: ["sys"] });
    },
    onError: (err) => notifyError(err),
  });

  const namespacesQuery = useQuery({
    queryKey: ["sys", sysSessionVersion, "settings", "namespaces"],
    enabled: hasValidSysToken,
    meta: { silent: true },
    queryFn: async () => listSysConfigNamespaces({ page: 1, size: 200 }),
  });

  const namespaces: SysConfigNamespaceSummary[] = namespacesQuery.data?.items ?? [];
  const currentSummary = useMemo(
    () => namespaces.find((n) => n.namespace === namespaceId) ?? null,
    [namespaceId, namespaces],
  );

  const detailQuery = useQuery({
    queryKey: ["sys", sysSessionVersion, "settings", "detail", namespaceId],
    enabled: hasValidSysToken,
    meta: { silent: true },
    queryFn: async () => getSysConfigNamespace(namespaceId),
  });

  const revisionsQuery = useQuery({
    queryKey: ["sys", sysSessionVersion, "settings", "revisions", namespaceId],
    enabled: hasValidSysToken,
    meta: { silent: true },
    queryFn: async () => listSysConfigRevisions(namespaceId, { page: 1, size: 20 }),
  });

  const stepUpRequired =
    (hasValidSysToken && isStepUpRequired(detailQuery.error)) ||
    (hasValidSysToken && isStepUpRequired(revisionsQuery.error));

  useEffect(() => {
    if (!stepUpRequired) return;
    clearSysToken();
    setStepOpen(true);
  }, [clearSysToken, stepUpRequired]);

  const patchMutation = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      return await patchSysConfigNamespace(namespaceId, { patch, activate: false });
    },
    onSuccess: (out) => {
      if (out.revisionId) setLastDraftRevisionId(out.revisionId);
      setLastTestChecks(null);
      void queryClient.invalidateQueries({
        queryKey: ["sys", sysSessionVersion, "settings", "revisions", namespaceId],
      });
    },
    onError: (err) => notifyError(err),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      if (!lastDraftRevisionId) throw new Error("missing revisionId");
      return await testSysConfigRevision(namespaceId, { revisionId: lastDraftRevisionId });
    },
    onSuccess: (out) => {
      setLastTestChecks(out.checks || []);
    },
    onError: (err) => notifyError(err),
  });

  const activateMutation = useMutation({
    mutationFn: async () => {
      if (!lastDraftRevisionId) throw new Error("missing revisionId");
      return await activateSysConfigRevision(namespaceId, { revisionId: lastDraftRevisionId });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["sys", sysSessionVersion, "settings", "detail", namespaceId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["sys", sysSessionVersion, "settings", "revisions", namespaceId],
      });
      if (namespaceId === "auth") {
        void queryClient.invalidateQueries({ queryKey: systemRuntimeQueryKey() });
      }
    },
    onError: (err) => notifyError(err),
  });

  const detail: SysConfigDetail | null = detailQuery.data ?? null;
  const activeRevisionId = detail?.activeRevisionId ?? null;

  const canOperateOnDraft = Boolean(lastDraftRevisionId);
  const isTesting = testMutation.isPending;
  const isActivating = activateMutation.isPending;

  const testOk = useMemo(() => {
    if (!lastTestChecks) return null;
    if (!Array.isArray(lastTestChecks)) return null;
    return lastTestChecks.every((c) => Boolean(c.ok));
  }, [lastTestChecks]);

  return (
    <div className="flex flex-col gap-6 min-h-0">
      <SysStepUpDialog
        open={stepOpen}
        busy={stepUpMutation.isPending}
        password={password}
        setPassword={setPassword}
        error={stepUpMutation.error}
        onCancel={() => {
          setStepOpen(false);
          void navigate({ to: "/" });
        }}
        onSubmit={() => stepUpMutation.mutate()}
      />

      <section className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-title2">{currentSummary?.title ?? t("sys:SYS_SETTINGS_TITLE")}</div>
          <div className="mt-1 text-label-secondary">
            {currentSummary?.description ?? t("sys:SYS_SETTINGS_DESC")}
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                disabled={!hasValidSysToken || namespacesQuery.isPending || namespaces.length <= 1}
              >
                <span className="max-w-55 truncate">{currentSummary?.title ?? namespaceId}</span>
                <ChevronDownIcon className="ml-2 size-4 text-label-secondary" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {namespaces.map((ns) => (
                <DropdownMenuItem
                  key={ns.namespace}
                  disabled={ns.namespace === namespaceId}
                  onClick={() => {
                    void navigate({
                      to: "/sys/settings/$namespace",
                      params: { namespace: ns.namespace },
                    });
                  }}
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <div className="truncate">{ns.title || ns.namespace}</div>
                    {ns.description ? (
                      <div className="truncate text-footnote text-label-secondary">
                        {ns.description}
                      </div>
                    ) : null}
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="outline"
            disabled={!canOperateOnDraft || isTesting || isActivating}
            onClick={() => testMutation.mutate()}
          >
            {t("sys:SYS_REVISION_TEST")}
          </Button>
          <Button
            disabled={!canOperateOnDraft || isTesting || isActivating || testOk === false}
            onClick={() => activateMutation.mutate()}
          >
            {t("sys:SYS_REVISION_ACTIVATE")}
          </Button>
        </div>
      </section>

      {detailQuery.error && isSuperAdminRequired(detailQuery.error) ? (
        <RouterDefaultError error={detailQuery.error} reset={() => void detailQuery.refetch()} />
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6 min-h-0">
        <div className="min-w-0">
          {detail ? (
            <div className="rounded-lg border bg-card/60 p-4">
              <ExtensionSettingsForm
                detail={detail}
                disabled={patchMutation.isPending}
                saving={patchMutation.isPending}
                submitText={t("settings:SETTINGS_SAVE")}
                resetOnSubmit={false}
                onSubmitPatch={async (patch) => {
                  await patchMutation.mutateAsync(patch);
                }}
              />
            </div>
          ) : (
            <div className="rounded-lg border bg-card/60 p-4 text-label-secondary">
              {detailQuery.isPending ? t("common:LOADING") : t("errors:ERROR_GENERIC")}
            </div>
          )}

          {lastDraftRevisionId ? (
            <div className="mt-4 rounded-lg border bg-card/60 p-4">
              <div className="text-footnote text-label-secondary">{t("sys:SYS_REVISION_ID")}</div>
              <div className="mt-1 font-mono text-footnote break-all">{lastDraftRevisionId}</div>

              {testOk !== null ? (
                <div
                  className={cn(
                    "mt-3 text-footnote",
                    testOk ? "text-emerald-600" : "text-destructive",
                  )}
                >
                  {testOk ? t("sys:SYS_TEST_OK") : t("sys:SYS_TEST_FAILED")}
                </div>
              ) : null}

              {lastTestChecks && lastTestChecks.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {lastTestChecks.map((c) => (
                    <li
                      key={c.code}
                      className="flex items-start justify-between gap-2 text-footnote"
                    >
                      <span className="font-mono text-caption text-label-secondary">{c.code}</span>
                      <span
                        className={cn("shrink-0", c.ok ? "text-emerald-600" : "text-destructive")}
                      >
                        {c.ok ? "OK" : "FAIL"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>

        <aside className="min-w-0 min-h-0">
          <div className="rounded-lg border bg-card/60 p-4">
            <div className="text-title3">{t("sys:SYS_REVISION_TITLE")}</div>
            <div className="mt-1 text-footnote text-label-secondary">
              {activeRevisionId ? (
                <>
                  {t("sys:SYS_REVISION_ACTIVE")}：
                  <span className="font-mono">{activeRevisionId}</span>
                </>
              ) : (
                <span className="text-label-secondary">—</span>
              )}
            </div>

            <div className="mt-4 flex flex-col gap-2">
              {(revisionsQuery.data?.items || []).map((rev) => {
                const isActive = Boolean(activeRevisionId) && rev.id === activeRevisionId;
                return (
                  <div
                    key={rev.id}
                    className={cn(
                      "rounded-md border px-3 py-2",
                      isActive ? "border-primary/40 bg-primary/5" : "border-border/60 bg-card/40",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-mono text-caption truncate">{rev.id}</div>
                      {isActive ? (
                        <SysRevisionActiveTag label={t("sys:SYS_REVISION_ACTIVE")} />
                      ) : null}
                    </div>
                    <div className="mt-1 text-caption text-label-secondary">
                      {dateTime.formatDateTime(rev.createdAt)}
                    </div>
                  </div>
                );
              })}

              {revisionsQuery.isPending ? (
                <div className="text-footnote text-label-secondary">{t("common:LOADING")}</div>
              ) : null}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function SysStepUpDialog(props: {
  open: boolean;
  busy: boolean;
  password: string;
  setPassword: (v: string) => void;
  error: unknown;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const { t } = useTranslation(["sys", "common", "auth"]);

  const err = props.error;
  const msg =
    err instanceof ApiError && err.error === "SYS_STEP_UP_REQUIRED"
      ? t("sys:SYS_STEP_UP_REQUIRED")
      : err instanceof ApiError && err.message
        ? err.message
        : null;

  return (
    <Dialog open={props.open} onOpenChange={(next) => (!next ? props.onCancel() : null)}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t("sys:SYS_STEP_UP_TITLE")}</DialogTitle>
          <DialogDescription>{t("sys:SYS_STEP_UP_DESC")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <div className="text-footnote text-label-secondary">
            {t("sys:SYS_STEP_UP_PASSWORD_LABEL")}
          </div>
          <Input
            type="password"
            value={props.password}
            onChange={(e) => props.setPassword(e.target.value)}
            autoComplete="current-password"
            disabled={props.busy}
          />
          {msg ? <div className="text-footnote text-destructive">{msg}</div> : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={props.onCancel} disabled={props.busy}>
            {t("sys:SYS_STEP_UP_CANCEL")}
          </Button>
          <Button onClick={props.onSubmit} disabled={props.busy || !props.password.trim()}>
            {t("sys:SYS_STEP_UP_SUBMIT")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
