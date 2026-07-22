import { useDeferredValue, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, CircleAlert, PackageCheck, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

import type {
  OfficialSkillCatalogDetailOut,
  OfficialSkillCatalogItemOut,
  SkillInstallationCreateRequest,
  SkillInstallationOut,
} from "@arclayer/openapi";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import { Badge } from "@arclayer/ui/badge";
import { Button } from "@arclayer/ui/button";
import { Separator } from "@arclayer/ui/separator";
import { Skeleton } from "@arclayer/ui/skeleton";
import { Switch } from "@arclayer/ui/switch";
import {
  WORKSPACE_SKILLS_QUERY_KEY,
  createWorkspaceSkillInstallation,
  getOfficialSkillCatalogPackage,
  getWorkspaceSkillInstallation,
  listOfficialSkillCatalog,
  updateWorkspaceSkillInstallation,
} from "@/api/workspace-skills";
import { notifyError, notifySuccessText } from "@/lib/notifications";

import { WorkspaceSkillInstallDialog } from "./workspace-skill-install-dialog";
import { WorkspaceSkillRemovalAction } from "./workspace-skill-removal-action";
import { WorkspaceSkillUpdateAction } from "./workspace-skill-update-action";

export function WorkspaceOfficialSkillsCatalog(props: { workspaceId: string; search: string }) {
  const { t } = useTranslation(["settings", "common"]);
  const queryClient = useQueryClient();
  const deferredSearch = useDeferredValue(props.search.trim());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [installOpen, setInstallOpen] = useState(false);
  const catalogQuery = useQuery({
    queryKey: [...WORKSPACE_SKILLS_QUERY_KEY, props.workspaceId, "official", deferredSearch],
    queryFn: ({ signal }) =>
      listOfficialSkillCatalog(props.workspaceId, {
        q: deferredSearch || undefined,
        limit: 100,
        signal,
      }),
  });
  const items = catalogQuery.data?.items ?? [];
  const selected = items.find((item) => item.packageId === selectedId) ?? items[0];

  useEffect(() => {
    if (selected?.packageId !== selectedId) setSelectedId(selected?.packageId ?? null);
  }, [selected, selectedId]);

  const detailQuery = useQuery({
    queryKey: [
      ...WORKSPACE_SKILLS_QUERY_KEY,
      props.workspaceId,
      "official-detail",
      selected?.packageId,
    ],
    queryFn: ({ signal }) =>
      getOfficialSkillCatalogPackage(props.workspaceId, selected!.packageId, signal),
    enabled: Boolean(selected),
  });
  const installationQuery = useQuery({
    queryKey: [
      ...WORKSPACE_SKILLS_QUERY_KEY,
      props.workspaceId,
      "installation",
      detailQuery.data?.installationId,
    ],
    queryFn: ({ signal }) =>
      getWorkspaceSkillInstallation(props.workspaceId, detailQuery.data!.installationId!, signal),
    enabled: Boolean(detailQuery.data?.installationId),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: WORKSPACE_SKILLS_QUERY_KEY });
  const installMutation = useMutation({
    mutationFn: (payload: SkillInstallationCreateRequest) =>
      createWorkspaceSkillInstallation(props.workspaceId, payload, crypto.randomUUID()),
    onSuccess: async () => {
      await invalidate();
      notifySuccessText(t("settings:SETTINGS_WORKSPACE_SKILLS_INSTALLED"));
    },
    onError: notifyError,
  });
  const updateMutation = useMutation({
    mutationFn: (enabled: boolean) => {
      const detail = detailQuery.data!;
      return updateWorkspaceSkillInstallation(props.workspaceId, detail.installationId!, {
        enabled,
        expectedRevision: detail.installationMetadataRevision!,
      });
    },
    onSuccess: async (updated) => {
      await invalidate();
      notifySuccessText(
        t(
          updated.status === "enabled"
            ? "settings:SETTINGS_WORKSPACE_SKILLS_ENABLED"
            : "settings:SETTINGS_WORKSPACE_SKILLS_DISABLED",
        ),
      );
    },
    onError: notifyError,
  });

  if (catalogQuery.isPending) return <OfficialCatalogLoading />;
  if (catalogQuery.isError) {
    return (
      <Alert variant="destructive">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>{t("settings:SETTINGS_WORKSPACE_SKILLS_OFFICIAL_ERROR")}</AlertTitle>
        <AlertDescription className="flex flex-col gap-2">
          <span>{t("settings:SETTINGS_WORKSPACE_SKILLS_OFFICIAL_ERROR_DESC")}</span>
          <Button
            size="sm"
            variant="outline"
            className="self-start"
            onClick={() => catalogQuery.refetch()}
          >
            {t("common:RETRY")}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <section aria-labelledby="official-skills-title" className="rounded-xl border bg-background">
      <header className="flex flex-wrap items-start justify-between gap-3 px-4 py-4 sm:px-5">
        <div>
          <div className="flex items-center gap-2">
            <BadgeCheck className="size-4 text-action" aria-hidden="true" />
            <h2 id="official-skills-title" className="text-headline text-label-primary">
              {t("settings:SETTINGS_WORKSPACE_SKILLS_OFFICIAL_TITLE")}
            </h2>
          </div>
          <p className="mt-1 max-w-3xl text-footnote text-label-secondary">
            {t("settings:SETTINGS_WORKSPACE_SKILLS_OFFICIAL_AVAILABLE_DESC")}
          </p>
        </div>
        <Badge variant="outline">{t("settings:SETTINGS_WORKSPACE_SKILLS_OFFICIAL_VERIFIED")}</Badge>
      </header>
      <Separator />
      {items.length && selected ? (
        <div className="grid min-h-80 lg:grid-cols-[minmax(16rem,0.85fr)_minmax(0,1.35fr)]">
          <div className="divide-y border-b lg:border-b-0 lg:border-r">
            {items.map((item) => (
              <OfficialSkillRow
                key={item.packageId}
                item={item}
                selected={item.packageId === selected.packageId}
                onSelect={() => setSelectedId(item.packageId)}
              />
            ))}
          </div>
          <OfficialSkillDetail
            item={selected}
            pending={detailQuery.isPending}
            error={detailQuery.isError}
            detail={detailQuery.data}
            installation={installationQuery.data}
            installationPending={
              installationQuery.isPending && Boolean(detailQuery.data?.installed)
            }
            installationError={installationQuery.isError}
            updating={updateMutation.isPending}
            onRetry={() => detailQuery.refetch()}
            onInstallationRetry={() => installationQuery.refetch()}
            onInstall={() => setInstallOpen(true)}
            onEnabledChange={(enabled) => updateMutation.mutate(enabled)}
          />
        </div>
      ) : (
        <p className="border-t px-5 py-8 text-center text-footnote text-label-secondary">
          {t("settings:SETTINGS_WORKSPACE_SKILLS_OFFICIAL_EMPTY")}
        </p>
      )}
      {detailQuery.data ? (
        <WorkspaceSkillInstallDialog
          open={installOpen}
          onOpenChange={setInstallOpen}
          pending={installMutation.isPending}
          packageScope="system"
          version={{
            id: detailQuery.data.versionId,
            packageId: detailQuery.data.packageId,
            versionNumber: detailQuery.data.versionNumber,
            semanticVersion: detailQuery.data.semanticVersion,
            packageChecksum: detailQuery.data.packageChecksum,
            manifest: detailQuery.data.manifest,
          }}
          validation={detailQuery.data.validation}
          onSubmit={(payload) => installMutation.mutateAsync(payload).then(() => undefined)}
        />
      ) : null}
    </section>
  );
}

function OfficialSkillRow(props: {
  item: OfficialSkillCatalogItemOut;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation("settings");
  return (
    <button
      type="button"
      className={`w-full px-4 py-3 text-left transition-colors duration-100 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${props.selected ? "bg-accent/60" : ""}`}
      aria-pressed={props.selected}
      onClick={props.onSelect}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="text-footnote font-semibold text-label-primary">
          {t(props.item.displayNameKey, { defaultValue: props.item.displayName })}
        </span>
        {props.item.installed ? (
          <Badge variant="secondary">{t("SETTINGS_WORKSPACE_SKILLS_INSTALLED_BADGE")}</Badge>
        ) : null}
      </span>
      <span className="mt-1 line-clamp-2 block text-caption text-label-secondary">
        {t(props.item.descriptionKey, { defaultValue: props.item.description })}
      </span>
    </button>
  );
}

function OfficialSkillDetail(props: {
  item: OfficialSkillCatalogItemOut;
  pending: boolean;
  error: boolean;
  detail?: OfficialSkillCatalogDetailOut;
  installation?: SkillInstallationOut;
  installationPending: boolean;
  installationError: boolean;
  updating: boolean;
  onRetry: () => void;
  onInstallationRetry: () => void;
  onInstall: () => void;
  onEnabledChange: (enabled: boolean) => void;
}) {
  const { t } = useTranslation(["settings", "common"]);
  if (props.pending) return <OfficialDetailLoading />;
  if (props.error || !props.detail) {
    return (
      <div className="p-5">
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>{t("settings:SETTINGS_WORKSPACE_SKILLS_OFFICIAL_DETAIL_ERROR")}</AlertTitle>
          <AlertDescription>
            <Button size="sm" variant="outline" className="mt-2" onClick={props.onRetry}>
              {t("common:RETRY")}
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  const exactInstallation = props.item.installationVersionId === props.item.versionId;
  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 sm:p-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-title-3 text-label-primary">
            {t(`settings:${props.item.displayNameKey}`, { defaultValue: props.item.displayName })}
          </h3>
          <Badge variant="outline" className="font-mono tabular-nums">
            {props.item.semanticVersion ?? `v${props.item.versionNumber}`}
          </Badge>
        </div>
        <p className="mt-2 text-footnote text-label-secondary">
          {t(`settings:${props.item.descriptionKey}`, { defaultValue: props.item.description })}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {props.item.capabilityTags.map((tag) => (
          <Badge key={tag} variant="secondary" className="font-mono text-caption">
            {tag}
          </Badge>
        ))}
      </div>
      <div className="rounded-lg border bg-muted/20 p-3">
        <span className="text-caption font-semibold text-label-primary">
          {t("settings:SETTINGS_WORKSPACE_SKILLS_CHECKSUM_LABEL")}
        </span>
        <code className="mt-1 block break-all text-caption text-label-secondary">
          {props.item.packageChecksum}
        </code>
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <span className="inline-flex items-center gap-2 text-footnote text-label-secondary">
          <ShieldCheck className="size-4" aria-hidden="true" />
          {t("settings:SETTINGS_WORKSPACE_SKILLS_OFFICIAL_VALIDATION", {
            status: props.item.validationStatus,
          })}
        </span>
        {!props.item.installed ? (
          <Button onClick={props.onInstall}>
            <PackageCheck data-icon="inline-start" />
            {t("settings:SETTINGS_WORKSPACE_SKILLS_REVIEW_INSTALL")}
          </Button>
        ) : props.installationPending ? (
          <Button variant="outline" loading disabled>
            {t("settings:SETTINGS_WORKSPACE_SKILLS_INSTALLATION_LOADING")}
          </Button>
        ) : props.installationError ? (
          <Button variant="outline" onClick={props.onInstallationRetry}>
            {t("common:RETRY")}
          </Button>
        ) : props.installation ? (
          <div className="flex flex-wrap items-center gap-2">
            {exactInstallation ? (
              <label className="flex min-h-11 items-center gap-3 rounded-lg border px-3">
                <span className="text-footnote font-semibold text-label-primary">
                  {t("settings:SETTINGS_WORKSPACE_SKILLS_INSTALLATION_ENABLED")}
                </span>
                <Switch
                  checked={props.item.installationStatus === "enabled"}
                  disabled={props.updating}
                  onCheckedChange={props.onEnabledChange}
                />
              </label>
            ) : (
              <WorkspaceSkillUpdateAction
                workspaceId={props.installation.workspaceId}
                installation={props.installation}
                candidate={{
                  id: props.detail.versionId,
                  versionNumber: props.detail.versionNumber,
                  semanticVersion: props.detail.semanticVersion,
                  packageChecksum: props.detail.packageChecksum,
                  validationFindingHash: props.detail.validationFindingHash,
                  manifest: props.detail.manifest,
                }}
              />
            )}
            <WorkspaceSkillRemovalAction
              workspaceId={props.installation.workspaceId}
              installation={props.installation}
            />
          </div>
        ) : (
          <span className="text-footnote text-label-secondary">
            {t("settings:SETTINGS_WORKSPACE_SKILLS_INSTALLATION_MISSING")}
          </span>
        )}
      </div>
    </div>
  );
}

function OfficialCatalogLoading() {
  return <Skeleton className="h-96 w-full rounded-xl" />;
}

function OfficialDetailLoading() {
  return <Skeleton className="m-5 h-64 rounded-lg" />;
}
