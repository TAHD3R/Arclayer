import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Avatar, Button, Input } from "antd";
import { AlertCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import * as authApi from "@/api/auth";
import { SettingCard, SettingCardContent, SettingCardHeader } from "@celestial/ui/setting-card";
import { SettingDialog } from "@celestial/ui/setting-dialog";
import { resolveAssetRefToPublicUrlPath } from "@/lib/assets/asset-urls";
import { initialsFromName } from "@/lib/auth/user-profile";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { MeProfileChangeEmailDialog } from "@/pages/me/profile/components/profile-change-email-dialog";

function isValidDisplayName(value: string | null): boolean {
  if (value === null) return true;
  // Keep display name conservative to avoid confusing layout / impersonation tricks.
  // Allow: letters, numbers, underscore, CJK, space, dot, hyphen.
  return /^[a-zA-Z0-9_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5 ._-]*$/.test(value);
}

function normalizeDisplayName(value: string): string | null {
  const normalized = String(value || "").trim();
  return normalized ? normalized : null;
}

export type MeProfileBasicsSectionProps = {
  profile: {
    username: string | null;
    email: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  };
};

export function MeProfileBasicsSection(props: MeProfileBasicsSectionProps) {
  const { t } = useTranslation(["account", "settings", "common"]);
  const queryClient = useQueryClient();

  const displayNameFallback =
    props.profile.displayName ?? props.profile.username ?? props.profile.email ?? "-";

  const [displayNameDraft, setDisplayNameDraft] = useState(props.profile.displayName ?? "");
  const [displayNameDirty, setDisplayNameDirty] = useState(false);
  const [confirmDisplayNameOpen, setConfirmDisplayNameOpen] = useState(false);

  useEffect(() => {
    if (displayNameDirty) return;
    setDisplayNameDraft(props.profile.displayName ?? "");
  }, [displayNameDirty, props.profile.displayName]);

  const currentDisplayNameNormalized = useMemo(
    () => normalizeDisplayName(props.profile.displayName ?? ""),
    [props.profile.displayName],
  );
  const nextDisplayNameNormalized = useMemo(
    () => normalizeDisplayName(displayNameDraft),
    [displayNameDraft],
  );

  const isDisplayNameValid = useMemo(
    () => isValidDisplayName(nextDisplayNameNormalized),
    [nextDisplayNameNormalized],
  );

  const canSaveDisplayName =
    currentDisplayNameNormalized !== nextDisplayNameNormalized && isDisplayNameValid;

  const updateProfileMutation = useMutation({
    mutationFn: async (payload: { display_name: string | null }) =>
      authApi.updateMyProfile(payload),
    onSuccess: async () => {
      notifySuccessText(t("settings:SETTINGS_SAVED"));
      setConfirmDisplayNameOpen(false);
      setDisplayNameDirty(false);
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
    onError: (err) => notifyError(err),
  });

  const [changeEmailOpen, setChangeEmailOpen] = useState(false);

  return (
    <>
      <div className="flex flex-col gap-6">
        <SettingCard>
          <SettingCardHeader
            title={t("account:ME_PROFILE_PANEL_TITLE")}
            description={t("account:ME_TAB_PROFILE_DESC")}
          />
          <SettingCardContent>
            <div className="flex flex-row items-start gap-6 sm:gap-8">
              <div className="flex flex-col gap-3 shrink-0">
                <div className="relative">
                  <Avatar
                    size={80}
                    src={resolveAssetRefToPublicUrlPath(props.profile.avatarUrl) ?? undefined}
                    className="rounded-full ring-1 ring-border/50 ring-offset-2 ring-offset-background"
                  >
                    {initialsFromName(displayNameFallback === "-" ? "用户" : displayNameFallback)}
                  </Avatar>
                </div>
              </div>

              <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                <label className="text-body font-medium text-label-primary">
                  {t("account:ME_PROFILE_DISPLAY_NAME_TITLE")}
                </label>
                <div className="flex items-center gap-2 max-w-lg">
                  <Input
                    value={displayNameDraft}
                    onChange={(e) => {
                      setDisplayNameDraft(e.target.value);
                      setDisplayNameDirty(true);
                    }}
                    showCount
                    maxLength={64}
                    status={displayNameDirty && !isDisplayNameValid ? "error" : undefined}
                    className="h-10 text-body flex-1"
                    placeholder={t("account:ME_PROFILE_DISPLAY_NAME_PLACEHOLDER")}
                  />
                  <Button
                    type="primary"
                    disabled={!canSaveDisplayName || updateProfileMutation.isPending}
                    loading={updateProfileMutation.isPending}
                    onClick={() => setConfirmDisplayNameOpen(true)}
                    autoInsertSpace={false}
                    className="h-10 px-5 font-medium shadow-none"
                  >
                    {t("settings:SETTINGS_SAVE")}
                  </Button>
                </div>
                {displayNameDirty && !isDisplayNameValid && (
                  <div className="mt-1 flex items-center gap-1.5 text-footnote text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    {t("account:ME_PROFILE_DISPLAY_NAME_INVALID")}
                  </div>
                )}
              </div>
            </div>
          </SettingCardContent>
        </SettingCard>

        <SettingCard>
          <SettingCardContent className="flex items-center justify-between gap-4 p-6 sm:px-6">
            <div className="flex flex-col gap-1 min-w-0">
              <div className="text-headline text-label-primary">
                {t("account:ME_PROFILE_EMAIL_TITLE")}
              </div>
              <div className="text-callout text-label-secondary truncate">
                {props.profile.email ?? "-"}
              </div>
            </div>
            <Button
              type="default"
              onClick={() => setChangeEmailOpen(true)}
              autoInsertSpace={false}
              className="shrink-0"
            >
              {t("account:ME_PROFILE_EMAIL_CHANGE")}
            </Button>
          </SettingCardContent>
        </SettingCard>
      </div>

      <SettingDialog
        open={confirmDisplayNameOpen}
        onOpenChange={(open) => {
          if (updateProfileMutation.isPending) return;
          setConfirmDisplayNameOpen(open);
        }}
        title={t("account:ME_PROFILE_DISPLAY_NAME_CONFIRM_TITLE")}
        description={t("account:ME_PROFILE_DISPLAY_NAME_CONFIRM_DESC")}
        footer={
          <>
            <Button
              type="text"
              disabled={updateProfileMutation.isPending}
              onClick={() => setConfirmDisplayNameOpen(false)}
              autoInsertSpace={false}
            >
              {t("common:CANCEL")}
            </Button>
            <Button
              type="primary"
              disabled={!canSaveDisplayName}
              loading={updateProfileMutation.isPending}
              onClick={() => {
                void updateProfileMutation.mutateAsync({ display_name: nextDisplayNameNormalized });
              }}
              autoInsertSpace={false}
            >
              {t("settings:SETTINGS_SAVE")}
            </Button>
          </>
        }
      >
        <>
          <div className="text-callout text-label-secondary">
            {t("account:ME_PROFILE_DISPLAY_NAME_CONFIRM_PREVIEW")}
          </div>

          <div className="mt-4 flex items-center gap-4">
            <Avatar
              size={56}
              src={resolveAssetRefToPublicUrlPath(props.profile.avatarUrl) ?? undefined}
            >
              {initialsFromName(displayNameFallback === "-" ? "用户" : displayNameFallback)}
            </Avatar>

            <div className="min-w-0">
              <div className="truncate text-title2 font-semibold text-label-primary">
                {nextDisplayNameNormalized ?? t("account:ME_PROFILE_DISPLAY_NAME_EMPTY")}
              </div>
              <div className="mt-0.5 truncate text-callout text-label-secondary">
                {props.profile.email ?? "-"}
              </div>
            </div>
          </div>

          {!isDisplayNameValid ? (
            <div className="mt-4 text-callout leading-snug text-destructive">
              {t("account:ME_PROFILE_DISPLAY_NAME_INVALID")}
            </div>
          ) : null}
        </>
      </SettingDialog>

      <MeProfileChangeEmailDialog
        open={changeEmailOpen}
        onOpenChange={setChangeEmailOpen}
        nextEmail={props.profile.email ?? ""}
      />
    </>
  );
}
