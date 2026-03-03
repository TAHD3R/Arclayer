import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Avatar, Button, Input } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import * as authApi from "@/api/auth";
import { SettingDialog } from "@celestial/ui/setting-dialog";
import { SettingVerticalItem } from "@celestial/ui/setting-vertical-item";
import { resolveAssetRefToPublicUrlPath } from "@/lib/assets/asset-urls";
import { initialsFromName } from "@/lib/auth/user-profile";
import { copyToClipboard } from "@/lib/clipboard";
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
  userId: string;
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
      <div className="flex flex-col gap-8">
        <SettingVerticalItem
          title={t("account:ME_PROFILE_DISPLAY_NAME_TITLE")}
          control={
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Input
                  value={displayNameDraft}
                  onChange={(e) => {
                    setDisplayNameDraft(e.target.value);
                    setDisplayNameDirty(true);
                  }}
                  showCount
                  maxLength={64}
                  status={displayNameDirty && !isDisplayNameValid ? "error" : undefined}
                  className="w-80"
                  placeholder={t("account:ME_PROFILE_DISPLAY_NAME_PLACEHOLDER")}
                />
                <Button
                  type="primary"
                  disabled={!canSaveDisplayName || updateProfileMutation.isPending}
                  loading={updateProfileMutation.isPending}
                  onClick={() => setConfirmDisplayNameOpen(true)}
                >
                  {t("settings:SETTINGS_SAVE")}
                </Button>
              </div>

              {displayNameDirty && !isDisplayNameValid ? (
                <div className="text-callout leading-snug text-destructive">
                  {t("account:ME_PROFILE_DISPLAY_NAME_INVALID")}
                </div>
              ) : null}
            </div>
          }
        />

        <SettingVerticalItem
          title={t("account:ME_PROFILE_AVATAR_TITLE")}
          control={
            <div className="flex items-start gap-4">
              <Avatar
                size={80}
                src={resolveAssetRefToPublicUrlPath(props.profile.avatarUrl) ?? undefined}
              >
                {initialsFromName(displayNameFallback === "-" ? "用户" : displayNameFallback)}
              </Avatar>

              <div className="min-w-0 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Button disabled type="default">
                    {t("account:ME_PROFILE_AVATAR_CHANGE")}
                  </Button>
                  <Button disabled type="default">
                    {t("account:ME_PROFILE_AVATAR_REMOVE")}
                  </Button>
                </div>

                <div className="text-callout leading-snug text-label-secondary">
                  <div>{t("account:ME_PROFILE_AVATAR_RECOMMENDED_DIMENSION")}</div>
                  <div>{t("account:ME_PROFILE_AVATAR_RECOMMENDED_SIZE")}</div>
                </div>
              </div>
            </div>
          }
        />

        <SettingVerticalItem
          title={t("account:ME_PROFILE_EMAIL_TITLE")}
          control={
            <div className="flex items-center gap-2">
              <Input value={props.profile.email ?? "-"} disabled className="w-80" />
              <Button type="default" onClick={() => setChangeEmailOpen(true)}>
                {t("account:ME_PROFILE_EMAIL_CHANGE")}
              </Button>
            </div>
          }
        />

        <SettingVerticalItem
          title={t("account:ME_PROFILE_USER_ID_TITLE")}
          control={
            <div className="flex items-center gap-2">
              <Input value={props.userId} disabled className="w-80" />
              <Button
                type="default"
                disabled={!props.userId || props.userId === "-"}
                onClick={() => {
                  void (async () => {
                    try {
                      await copyToClipboard(props.userId);
                      notifySuccessText(t("account:ME_PROFILE_USER_ID_COPIED"));
                    } catch (err) {
                      notifyError(err);
                    }
                  })();
                }}
              >
                {t("account:ME_PROFILE_USER_ID_COPY")}
              </Button>
            </div>
          }
        />
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
            >
              {t("settings:SETTINGS_SAVE")}
            </Button>
          </>
        }
      >
        <div className="py-5">
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
              <div className="text-title2 font-semibold text-label-primary truncate">
                {nextDisplayNameNormalized ?? t("account:ME_PROFILE_DISPLAY_NAME_EMPTY")}
              </div>
              <div className="mt-0.5 text-callout text-label-secondary truncate">
                {props.profile.email ?? "-"}
              </div>
            </div>
          </div>

          {!isDisplayNameValid ? (
            <div className="mt-4 text-callout leading-snug text-destructive">
              {t("account:ME_PROFILE_DISPLAY_NAME_INVALID")}
            </div>
          ) : null}
        </div>
      </SettingDialog>

      <MeProfileChangeEmailDialog
        open={changeEmailOpen}
        onOpenChange={setChangeEmailOpen}
        nextEmail={props.profile.email ?? ""}
      />
    </>
  );
}
