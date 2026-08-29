import { useDeferredValue, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { i18n as I18nInstance } from "i18next";
import { BadgeCheck, Check, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import type {
  OfficialSkillCatalogDetailOut,
  OfficialSkillCatalogItemOut,
  SkillInstallationCreateRequest,
} from "@arclayer/openapi";
import { Button } from "@arclayer/ui/button";
import { Switch } from "@arclayer/ui/switch";

import {
  WORKSPACE_SKILLS_QUERY_KEY,
  createWorkspaceSkillInstallation,
  getOfficialSkillCatalogPackage,
  listOfficialSkillCatalog,
  updateWorkspaceSkillInstallation,
} from "@/api/workspace-skills";
import { BaseTag } from "@/components/ui/tags";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { requiredTranslation } from "@/lib/i18n/required-translation";
import { notifyError, notifySuccessText } from "@/lib/notifications";

import { WorkspaceSkillCard, WorkspaceSkillCardGrid } from "./workspace-skill-card";
import { WorkspaceSkillDetailDialog } from "./workspace-skill-detail-dialog";
import { WorkspaceSkillInstallDialog } from "./workspace-skill-install-dialog";
import { WorkspaceSkillsScopeEmpty } from "./workspace-skills-components";

type OfficialInstallationFields = Pick<
  OfficialSkillCatalogDetailOut,
  "installationId" | "installationMetadataRevision"
>;

export function WorkspaceOfficialSkillsSection(
  props: Readonly<{
    onSearchChange: (value: string) => void;
    search: string;
    workspaceId: string;
  }>,
) {
  const { t, i18n } = useTranslation(["settings", "common"]);
  const workspaceId = props.workspaceId;
  const queryClient = useQueryClient();
  const [detailPackageId, setDetailPackageId] = useState<string | null>(null);
  const [installDetail, setInstallDetail] = useState<OfficialSkillCatalogDetailOut | null>(null);
  const [installOpen, setInstallOpen] = useState(false);
  const [preparingId, setPreparingId] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(props.search.trim());

  const catalogQuery = useQuery({
    queryKey: [...WORKSPACE_SKILLS_QUERY_KEY, workspaceId, "official", deferredSearch],
    queryFn: ({ signal }) => loadOfficialCatalog(workspaceId, deferredSearch, signal),
  });
  const items = useMemo(() => catalogQuery.data ?? [], [catalogQuery.data]);

  const detailQuery = useQuery({
    queryKey: [...WORKSPACE_SKILLS_QUERY_KEY, workspaceId, "official-detail", detailPackageId],
    queryFn: ({ signal }) => getOfficialSkillCatalogPackage(workspaceId, detailPackageId!, signal),
    enabled: Boolean(detailPackageId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: WORKSPACE_SKILLS_QUERY_KEY });
  const installMutation = useMutation({
    mutationFn: (payload: SkillInstallationCreateRequest) =>
      createWorkspaceSkillInstallation(workspaceId, payload, crypto.randomUUID()),
    onSuccess: async () => {
      await invalidate();
      notifySuccessText(t("settings:SETTINGS_WORKSPACE_SKILLS_INSTALLED"));
    },
    onError: notifyError,
  });
  const updateMutation = useMutation({
    mutationFn: ({ detail, enabled }: { detail: OfficialInstallationFields; enabled: boolean }) => {
      if (!detail.installationId || detail.installationMetadataRevision == null) {
        throw new Error("Official Skill installation metadata is missing");
      }
      return updateWorkspaceSkillInstallation(workspaceId, detail.installationId, {
        enabled,
        expectedRevision: detail.installationMetadataRevision,
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

  async function prepareInstall(packageId: string) {
    setPreparingId(packageId);
    try {
      const detail = await queryClient.fetchQuery({
        queryKey: [...WORKSPACE_SKILLS_QUERY_KEY, workspaceId, "official-detail", packageId],
        queryFn: ({ signal }) => getOfficialSkillCatalogPackage(workspaceId, packageId, signal),
      });
      setInstallDetail(detail);
      setInstallOpen(true);
    } catch (error) {
      notifyError(error);
    } finally {
      setPreparingId(null);
    }
  }

  const detail = detailQuery.data;
  const detailEnabled = Boolean(detail?.installed && detail?.installationStatus === "enabled");

  return (
    <section
      aria-label={t("settings:SETTINGS_WORKSPACE_SKILLS_TAB_OFFICIAL")}
      className="space-y-5"
    >
      <ContentGuard
        error={catalogQuery.error}
        loading={catalogQuery.isPending}
        loadingVariant="card-grid"
        onRetry={() => void catalogQuery.refetch()}
      >
        {items.length ? (
          <WorkspaceSkillCardGrid>
            {items.map((item) => (
              <OfficialSkillCard
                installed={isEnabled(item)}
                item={item}
                key={item.packageId}
                onOpenDetail={() => setDetailPackageId(item.packageId)}
                onPrepareInstall={() => void prepareInstall(item.packageId)}
                preparing={preparingId === item.packageId}
              />
            ))}
          </WorkspaceSkillCardGrid>
        ) : (
          <WorkspaceSkillsScopeEmpty />
        )}
      </ContentGuard>

      <WorkspaceSkillDetailDialog
        actions={
          detail ? (
            <OfficialDetailActions
              detail={detail}
              enabled={detailEnabled}
              onPrepareInstall={() => void prepareInstall(detail.packageId)}
              onToggle={(enabled) => updateMutation.mutate({ detail, enabled })}
            />
          ) : undefined
        }
        description={detail ? localizedDescription(detail, i18n) : null}
        files={detail?.resources ?? []}
        icon={<BadgeCheck aria-hidden="true" />}
        loading={detailQuery.isPending}
        onOpenChange={(open) => {
          if (!open) setDetailPackageId(null);
        }}
        open={Boolean(detailPackageId)}
        subtitle={
          detail
            ? `${t("settings:SETTINGS_WORKSPACE_SKILLS_PUBLISHER_ARCLAYER")} · ${
                detail.semanticVersion ?? `v${detail.versionNumber}`
              }`
            : null
        }
        title={detail ? localizedName(detail, i18n) : ""}
      />

      {installDetail ? (
        <WorkspaceSkillInstallDialog
          open={installOpen}
          onOpenChange={setInstallOpen}
          pending={installMutation.isPending}
          packageScope="system"
          version={{
            id: installDetail.versionId,
            packageId: installDetail.packageId,
            versionNumber: installDetail.versionNumber,
            semanticVersion: installDetail.semanticVersion,
            packageChecksum: installDetail.packageChecksum,
            manifest: installDetail.manifest,
          }}
          validation={installDetail.validation}
          onSubmit={(payload) =>
            installMutation.mutateAsync(payload).then(() => setInstallOpen(false))
          }
        />
      ) : null}
    </section>
  );
}

function OfficialSkillCard(
  props: Readonly<{
    installed: boolean;
    item: OfficialSkillCatalogItemOut;
    onOpenDetail: () => void;
    onPrepareInstall: () => void;
    preparing: boolean;
  }>,
) {
  const { t, i18n } = useTranslation("settings");
  const { item } = props;
  const disabled = item.installed && item.installationStatus !== "enabled";
  return (
    <WorkspaceSkillCard
      action={
        props.installed ? (
          <span className="inline-flex size-8 items-center justify-center">
            <Check aria-hidden="true" className="size-5" strokeWidth={2} />
            <span className="sr-only">{t("SETTINGS_WORKSPACE_SKILLS_CARD_ADDED")}</span>
          </span>
        ) : disabled ? (
          <BaseTag color="default">{t("SETTINGS_WORKSPACE_SKILLS_CARD_DISABLED")}</BaseTag>
        ) : (
          <Button
            loading={props.preparing}
            onClick={props.onPrepareInstall}
            size="sm"
            variant="outline"
          >
            <Plus data-icon="inline-start" />
            {t("SETTINGS_WORKSPACE_SKILLS_CARD_ADD")}
          </Button>
        )
      }
      description={localizedDescription(item, i18n)}
      icon={<BadgeCheck aria-hidden="true" />}
      meta={`${t("SETTINGS_WORKSPACE_SKILLS_PUBLISHER_ARCLAYER")} · ${
        item.semanticVersion ?? `v${item.versionNumber}`
      }`}
      onSelect={props.onOpenDetail}
      title={localizedName(item, i18n)}
    />
  );
}

function OfficialDetailActions(
  props: Readonly<{
    detail: OfficialSkillCatalogDetailOut;
    enabled: boolean;
    onPrepareInstall: () => void;
    onToggle: (enabled: boolean) => void;
  }>,
) {
  const { t } = useTranslation(["settings", "common"]);
  if (!props.detail.installed) {
    return (
      <Button onClick={props.onPrepareInstall} size="sm" variant="outline">
        <Plus data-icon="inline-start" />
        {t("settings:SETTINGS_WORKSPACE_SKILLS_CARD_ADD")}
      </Button>
    );
  }
  return (
    <label className="flex h-10 items-center gap-2.5 rounded-lg border px-3">
      <span className="text-footnote font-semibold text-label-primary">
        {t("settings:SETTINGS_WORKSPACE_SKILLS_INSTALLATION_ENABLED")}
      </span>
      <Switch
        aria-label={t(
          props.enabled
            ? "settings:SETTINGS_WORKSPACE_SKILLS_DISABLE_ACTION"
            : "settings:SETTINGS_WORKSPACE_SKILLS_ENABLE_ACTION",
        )}
        checked={props.enabled}
        onCheckedChange={props.onToggle}
      />
    </label>
  );
}

async function loadOfficialCatalog(workspaceId: string, q: string, signal: AbortSignal) {
  const items: OfficialSkillCatalogItemOut[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await listOfficialSkillCatalog(workspaceId, {
      limit: 100,
      ...(cursor ? { cursor } : {}),
      ...(q ? { q } : {}),
      signal,
    });
    items.push(...(page.items ?? []));
    cursor = page.nextCursor ?? undefined;
    if (cursor && seenCursors.has(cursor)) {
      throw new Error("Official Skill catalog returned a repeated cursor");
    }
    if (cursor) seenCursors.add(cursor);
  } while (cursor);
  return items;
}

type LocalizableSkill = Pick<
  OfficialSkillCatalogItemOut,
  "description" | "descriptionKey" | "displayName" | "displayNameKey"
>;

function localizedName(item: LocalizableSkill, i18n: I18nInstance) {
  return item.displayNameKey
    ? requiredTranslation(i18n, `settings:${item.displayNameKey}`, "official Skill name")
    : item.displayName;
}

function localizedDescription(item: LocalizableSkill, i18n: I18nInstance) {
  return item.descriptionKey
    ? requiredTranslation(i18n, `settings:${item.descriptionKey}`, "official Skill description")
    : item.description;
}

function isEnabled(item: Pick<OfficialSkillCatalogItemOut, "installed" | "installationStatus">) {
  return item.installed && item.installationStatus === "enabled";
}
