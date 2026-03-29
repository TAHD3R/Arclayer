import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";

import * as authApi from "@/api/auth";
import { UserAvatar } from "@/components/common/entity-avatar";
import { AvatarUploadSlot } from "@/components/common/avatar-upload-slot";
import { SettingCard, SettingCardContent } from "@arclayer/ui/setting-card";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { resolveAssetRefToPublicUrlPath } from "@/lib/assets/asset-urls";
import { initialsFromName } from "@/lib/auth/user-profile";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { UserChangeEmailDialog } from "@/pages/usercenter/profile/components/profile-change-email-dialog";
import { UserPasswordSection } from "@/pages/usercenter/profile/components/profile-password-section";
import { uploadAvatarFile } from "@/pages/usercenter/profile/lib/avatar-upload";

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

export type UserProfileBasicsSectionProps = {
  profile: {
    username: string | null;
    email: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    avatarAssetId: string | null;
  };
  redirect: string;
};

export function UserProfileBasicsSection(props: UserProfileBasicsSectionProps) {
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

  const hasDisplayNameChanged = currentDisplayNameNormalized !== nextDisplayNameNormalized;
  const canSaveDisplayName = hasDisplayNameChanged && isDisplayNameValid;

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

  const updateAvatarMutation = useMutation({
    mutationFn: async (avatarAssetId: string | null) => authApi.updateMyProfile({ avatarAssetId }),
    onSuccess: async (data, avatarAssetId) => {
      const aligned = Boolean(data?.avatarAssetAligned);
      notifySuccessText(
        avatarAssetId
          ? aligned
            ? t("account:ME_PROFILE_AVATAR_UPDATED_ALIGNED")
            : t("account:ME_PROFILE_AVATAR_UPDATED")
          : t("account:ME_PROFILE_AVATAR_REMOVED"),
      );
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
    onError: (err) => notifyError(err),
  });
  const avatarUploadMutation = useMutation({
    mutationFn: async (file: File) => uploadAvatarFile(file),
    onError: (err) => notifyError(err),
  });
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);
  const isAvatarBusy = avatarUploadMutation.isPending || updateAvatarMutation.isPending;

  const handleAvatarFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file || isAvatarBusy) return;

    void (async () => {
      try {
        const assetId = await avatarUploadMutation.mutateAsync(file);
        await updateAvatarMutation.mutateAsync(assetId);
      } catch {
        // Errors are surfaced by mutation onError handlers.
      }
    })();
  };

  const [changeEmailOpen, setChangeEmailOpen] = useState(false);

  return (
    <>
      <div className="flex flex-col gap-6">
        <SettingCard>
          <SettingCardContent>
            <div className="flex flex-row items-start gap-6 sm:gap-8">
              <div className="flex flex-col gap-3 shrink-0">
                <input
                  ref={avatarFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  tabIndex={-1}
                  onChange={handleAvatarFileChange}
                />
                <AvatarUploadSlot
                  size={80}
                  shape="circle"
                  disabled={isAvatarBusy}
                  src={
                    resolveAssetRefToPublicUrlPath(
                      props.profile.avatarUrl ?? props.profile.avatarAssetId,
                    ) ?? undefined
                  }
                  fallback={initialsFromName(
                    displayNameFallback === "-" ? "用户" : displayNameFallback,
                  )}
                  uploadAriaLabel={t("account:ME_PROFILE_AVATAR_CHANGE")}
                  removeAriaLabel={t("account:ME_PROFILE_AVATAR_REMOVE")}
                  canRemove={Boolean(props.profile.avatarUrl || props.profile.avatarAssetId)}
                  onPick={() => avatarFileInputRef.current?.click()}
                  onRemove={() => void updateAvatarMutation.mutateAsync(null)}
                />
              </div>

              <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                <label className="text-body font-medium text-label-primary">
                  {t("account:ME_PROFILE_DISPLAY_NAME_TITLE")}
                </label>
                <div className="flex items-center gap-2 max-w-sm">
                  <Input
                    value={displayNameDraft}
                    onChange={(e) => {
                      setDisplayNameDraft(e.target.value);
                      setDisplayNameDirty(true);
                    }}
                    maxLength={64}
                    aria-invalid={displayNameDirty && !isDisplayNameValid}
                    className="h-10 flex-1 text-body"
                    placeholder={t("account:ME_PROFILE_DISPLAY_NAME_PLACEHOLDER")}
                  />
                  {hasDisplayNameChanged || updateProfileMutation.isPending ? (
                    <Button
                      disabled={!canSaveDisplayName || updateProfileMutation.isPending}
                      loading={updateProfileMutation.isPending}
                      onClick={() => setConfirmDisplayNameOpen(true)}
                      className="h-10 px-5 font-medium "
                    >
                      {t("settings:SETTINGS_SAVE")}
                    </Button>
                  ) : null}
                </div>
                <div className="text-footnote text-label-secondary">
                  {`${displayNameDraft.length}/64`}
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
            <Button onClick={() => setChangeEmailOpen(true)} className="shrink-0">
              {t("account:ME_PROFILE_EMAIL_CHANGE")}
            </Button>
          </SettingCardContent>
        </SettingCard>

        <UserPasswordSection redirect={props.redirect} />
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
              variant="ghost"
              disabled={updateProfileMutation.isPending}
              onClick={() => setConfirmDisplayNameOpen(false)}
            >
              {t("common:CANCEL")}
            </Button>
            <Button
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
        <>
          <div className="text-callout text-label-secondary">
            {t("account:ME_PROFILE_DISPLAY_NAME_CONFIRM_PREVIEW")}
          </div>

          <div className="mt-4 flex items-center gap-4">
            <UserAvatar
              name={displayNameFallback === "-" ? "用户" : displayNameFallback}
              assetRef={props.profile.avatarUrl}
              size={56}
            />

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
            <div className="mt-4 text-callout  text-destructive">
              {t("account:ME_PROFILE_DISPLAY_NAME_INVALID")}
            </div>
          ) : null}
        </>
      </SettingDialog>

      <UserChangeEmailDialog
        open={changeEmailOpen}
        onOpenChange={setChangeEmailOpen}
        nextEmail={props.profile.email ?? ""}
        redirect={props.redirect}
      />
    </>
  );
}
