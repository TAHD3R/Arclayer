import { AlertCircle, Copy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  WorkspaceAvatar,
  workspaceAvatarPropsFromIdentity,
} from "@/components/common/entity-avatar";
import { copyToClipboard } from "@/lib/clipboard";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { WorkspaceIconDialog } from "@/pages/usercenter/workspaces/components/workspace-icon-dialog";
import type { WorkspaceIconDialogValues } from "@/pages/usercenter/workspaces/hooks/use-workspace-menu-actions";
import type { UserCenterWorkspaceListItem } from "@/pages/usercenter/workspaces/types";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { SettingCard, SettingCardContent } from "@arclayer/ui/setting-card";
import { Textarea } from "@arclayer/ui/textarea";

import type { WorkspaceSettingsBasicsController } from "../hooks/use-workspace-settings-basics-controller";

const WORKSPACE_DESCRIPTION_MAX_LENGTH = 256;

function buildWorkspaceListItem(
  controller: WorkspaceSettingsBasicsController,
): UserCenterWorkspaceListItem | null {
  const detail = controller.detailQuery.data;
  if (!detail) return null;

  return {
    id: detail.id,
    workspaceId: detail.id,
    projectId: detail.project?.projectId ?? detail.id,
    name: detail.name,
    description: detail.description ?? null,
    iconMode: detail.iconMode ?? "initials",
    iconColor: detail.iconColor ?? "#337ea9",
    iconGlyph: detail.iconGlyph ?? null,
    iconEmoji: detail.iconEmoji ?? null,
    iconUrl: detail.iconUrl ?? null,
    isArchived: false,
    archivedAt: null,
    archivedByUserId: null,
    archiveRevision: 0,
    memberCount: 0,
    membersPreview: [],
    createdAt: null,
    enterable: true,
  };
}

function buildIconDialogValues(workspace: UserCenterWorkspaceListItem): WorkspaceIconDialogValues {
  return {
    iconMode: workspace.iconMode,
    iconColor: workspace.iconColor,
    iconGlyph: workspace.iconGlyph ?? null,
    iconEmoji: workspace.iconEmoji ?? null,
    iconUrl: workspace.iconUrl ?? null,
  };
}

function buildWorkspaceIconPatch(values: WorkspaceIconDialogValues) {
  return {
    iconMode: values.iconMode,
    iconColor: values.iconColor,
    iconGlyph: values.iconMode === "glyph" ? values.iconGlyph : null,
    iconEmoji: values.iconMode === "emoji" ? values.iconEmoji : null,
    iconUrl: values.iconMode === "image" ? values.iconUrl : null,
  } as const;
}

function normalizeName(value: string): string {
  return String(value || "").trim();
}

function normalizeDescription(value: string): string {
  return String(value || "");
}

export function WorkspaceSettingsIconAccordionItem(props: {
  controller: WorkspaceSettingsBasicsController;
}) {
  const c = props.controller;
  const { t } = c;
  const workspace = useMemo(() => buildWorkspaceListItem(c), [c]);
  const [dialogWorkspace, setDialogWorkspace] = useState<UserCenterWorkspaceListItem | null>(null);
  const [dialogValues, setDialogValues] = useState<WorkspaceIconDialogValues>({
    iconMode: "initials",
    iconColor: "#337ea9",
    iconGlyph: null,
    iconEmoji: null,
    iconUrl: null,
  });

  const [nameDraft, setNameDraft] = useState(c.currentWorkspaceName ?? "");
  const [nameDirty, setNameDirty] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState(c.currentWorkspaceDescription ?? "");
  const [descriptionDirty, setDescriptionDirty] = useState(false);

  useEffect(() => {
    if (nameDirty) return;
    setNameDraft(c.currentWorkspaceName ?? "");
  }, [c.currentWorkspaceName, nameDirty]);

  useEffect(() => {
    if (descriptionDirty) return;
    setDescriptionDraft(c.currentWorkspaceDescription ?? "");
  }, [c.currentWorkspaceDescription, descriptionDirty]);

  const currentNameNormalized = useMemo(
    () => normalizeName(c.currentWorkspaceName ?? ""),
    [c.currentWorkspaceName],
  );
  const nextNameNormalized = useMemo(() => normalizeName(nameDraft), [nameDraft]);
  const hasNameChanged = currentNameNormalized !== nextNameNormalized;
  const canSaveName =
    hasNameChanged && nextNameNormalized.length > 0 && nextNameNormalized.length <= 128;

  const currentDescriptionNormalized = useMemo(
    () => normalizeDescription(c.currentWorkspaceDescription ?? "").trim(),
    [c.currentWorkspaceDescription],
  );
  const nextDescriptionNormalized = useMemo(
    () => normalizeDescription(descriptionDraft).trim(),
    [descriptionDraft],
  );
  const hasDescriptionChanged = currentDescriptionNormalized !== nextDescriptionNormalized;
  const canSaveDescription = descriptionDraft.length <= WORKSPACE_DESCRIPTION_MAX_LENGTH;

  const openIconDialog = () => {
    if (!workspace) return;
    setDialogWorkspace(workspace);
    setDialogValues(buildIconDialogValues(workspace));
  };

  const handleSaveName = () => {
    if (!canSaveName) return;
    void c.withSavingKey("workspace:name", async () => {
      await c.patchWorkspaceMutation.mutateAsync({ name: nextNameNormalized });
      setNameDirty(false);
    });
  };

  const handleSaveDescription = () => {
    if (!hasDescriptionChanged || !canSaveDescription) return;
    void c.withSavingKey("workspace:description", async () => {
      await c.patchWorkspaceMutation.mutateAsync({
        description: nextDescriptionNormalized || null,
      });
      setDescriptionDirty(false);
    });
  };

  const handleCopy = async (value: string | null | undefined, copiedKey: string) => {
    if (!value) return;
    try {
      await copyToClipboard(value);
      notifySuccessText(t(copiedKey));
    } catch (error) {
      notifyError(error);
    }
  };

  return (
    <>
      <SettingCard>
        <SettingCardContent>
          <div className="flex flex-row items-start gap-6 sm:gap-8">
            <div className="flex flex-col gap-3 shrink-0 ml-1">
              <button
                type="button"
                className="rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                aria-label={t("common:ORG_WORKSPACES_ACTION_CHANGE_ICON")}
                disabled={c.disabled || !workspace}
                onClick={openIconDialog}
              >
                {workspace ? (
                  <WorkspaceAvatar
                    name={workspace.name}
                    size={80}
                    {...workspaceAvatarPropsFromIdentity(workspace)}
                  />
                ) : null}
              </button>
            </div>

            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
              <label className="text-body font-medium text-label-primary">
                {t("settings:SETTINGS_WORKSPACE_NAME_LABEL")}
              </label>
              <div className="flex items-center gap-2 max-w-sm">
                <Input
                  value={nameDraft}
                  onChange={(event) => {
                    setNameDraft(event.target.value);
                    setNameDirty(true);
                  }}
                  maxLength={128}
                  className="h-10 flex-1 text-body"
                  placeholder={t("settings:SETTINGS_WORKSPACE_NAME_PLACEHOLDER")}
                  disabled={c.disabled || !workspace}
                />
                {hasNameChanged || c.savingKey === "workspace:name" ? (
                  <Button
                    variant="outline"
                    disabled={!canSaveName || c.savingKey === "workspace:name"}
                    loading={c.savingKey === "workspace:name"}
                    onClick={handleSaveName}
                    className="h-10 px-5 font-medium"
                  >
                    {t("settings:SETTINGS_SAVE")}
                  </Button>
                ) : null}
              </div>
              <div className="text-footnote text-label-secondary">{`${nameDraft.length}/128`}</div>

              <label className="mt-2 text-body font-medium text-label-primary">
                {t("common:ORG_WORKSPACES_FIELD_DESCRIPTION")}
              </label>
              <div className="flex items-start gap-2 max-w-xl">
                <Textarea
                  rows={3}
                  value={descriptionDraft}
                  onChange={(event) => {
                    setDescriptionDraft(event.target.value);
                    setDescriptionDirty(true);
                  }}
                  maxLength={WORKSPACE_DESCRIPTION_MAX_LENGTH}
                  placeholder={t("common:ORG_WORKSPACES_FIELD_DESCRIPTION_PLACEHOLDER")}
                  disabled={c.disabled || !workspace}
                  className="max-w-sm resize-none text-body"
                />
                {hasDescriptionChanged || c.savingKey === "workspace:description" ? (
                  <Button
                    variant="outline"
                    disabled={!canSaveDescription || c.savingKey === "workspace:description"}
                    loading={c.savingKey === "workspace:description"}
                    onClick={handleSaveDescription}
                    className="h-10 px-5 font-medium"
                  >
                    {t("settings:SETTINGS_SAVE")}
                  </Button>
                ) : null}
              </div>
              <div className="text-footnote text-label-secondary">
                {`${descriptionDraft.length}/${WORKSPACE_DESCRIPTION_MAX_LENGTH}`}
              </div>
              {descriptionDraft.length > WORKSPACE_DESCRIPTION_MAX_LENGTH ? (
                <div className="mt-1 flex items-center gap-1.5 text-footnote text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  {t("settings:SETTINGS_WORKSPACE_DESCRIPTION_TOO_LONG")}
                </div>
              ) : null}
            </div>
          </div>
        </SettingCardContent>
      </SettingCard>

      <div className="mt-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-body font-medium text-label-primary">
              {t("settings:SETTINGS_WORKSPACE_ID_TITLE")}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <code className="max-w-[20rem] truncate font-mono text-callout text-label-secondary">
              {workspace?.workspaceId ?? "-"}
            </code>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={!workspace?.workspaceId}
              aria-label={t("common:DUPLICATE")}
              onClick={() =>
                void handleCopy(workspace?.workspaceId, "settings:SETTINGS_WORKSPACE_ID_COPIED")
              }
            >
              <Copy className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <WorkspaceIconDialog
        t={t}
        dialog={{
          workspace: dialogWorkspace,
          setWorkspace: setDialogWorkspace,
          values: dialogValues,
          setValues: setDialogValues,
          pending: c.patchWorkspaceMutation.isPending,
          onConfirm: async () => {
            if (!dialogWorkspace) return;
            await c.withSavingKey("workspace:icon", async () => {
              await c.patchWorkspaceMutation.mutateAsync(buildWorkspaceIconPatch(dialogValues));
            });
            setDialogWorkspace(null);
          },
          onClose: () => setDialogWorkspace(null),
        }}
      />
    </>
  );
}
