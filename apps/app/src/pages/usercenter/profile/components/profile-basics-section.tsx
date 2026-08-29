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
import {
  AssetUploadCleanupError,
  getAssetUploadCompletionCheckpoint,
} from "@/lib/assets/upload-completion";
import { initialsFromName } from "@/lib/auth/user-profile";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { uploadAvatarFile } from "@/pages/usercenter/profile/lib/avatar-upload";
import { UserProfileUserIdSection } from "@/pages/usercenter/profile/components/profile-user-id-section";

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
    id: string | null;
    username: string | null;
    email: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    avatarAssetId: string | null;
  };
};

export function UserProfileBasicsSection(props: UserProfileBasicsSectionProps) {
  const { t } = useTranslation(["account", "settings", "common"]);
  const queryClient = useQueryClient();

  const displayNameFallback =
    props.profile.displayName ?? props.profile.username ?? props.profile.email ?? "-";

  const [displayNameDraft, setDisplayNameDraft] = useState(props.profile.displayName ?? "");
  const [displayNameDirty, setDisplayNameDirty] = useState(false);
  const [confirmDisplayNameOpen, setConfirmDisplayNameOpen] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);

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
    mutationFn: async (payload: { displayName: string | null }) => authApi.updateMyProfile(payload),
    onSuccess: async () => {
      notifySuccessText(t("settings:SETTINGS_SAVED"));
      setConfirmDisplayNameOpen(false);
      setDisplayNameDirty(false);
      setIsEditingName(false);
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
    onError: (err) => notifyError(err),
  });

  const updateAvatarMutation = useMutation({
    mutationFn: async (avatarAssetId: string | null) =>
      authApi.updateMyProfile({ avatar_asset_id: avatarAssetId }),
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
    onError: handleAvatarUploadError,
  });
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);
  const isAvatarBusy = avatarUploadMutation.isPending || updateAvatarMutation.isPending;

  function handleAvatarUploadError(error: unknown) {
    const checkpoint = getAssetUploadCompletionCheckpoint(error);
    if (checkpoint) {
      notifyError(error);
      return;
    }
    if (error instanceof AssetUploadCleanupError) {
      notifyError(new Error(t("account:ME_PROFILE_AVATAR_CLEANUP_FAILED"), { cause: error }));
      return;
    }
    notifyError(error);
  }

  async function persistCompletedAvatar(assetId: string) {
    await updateAvatarMutation.mutateAsync(assetId);
  }

  const handleAvatarFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file || isAvatarBusy) return;

    void (async () => {
      try {
        const assetId = await avatarUploadMutation.mutateAsync(file);
        await persistCompletedAvatar(assetId);
      } catch {
        // Errors are surfaced by mutation onError handlers.
      }
    })();
  };

  return (
    <>
      <SettingCard>
        <SettingCardContent>
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between gap-6">
              <div className="min-w-0 shrink-0">
                <div className="text-body font-medium text-label-primary">
                  {t("account:ME_PROFILE_AVATAR_TITLE")}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end">
                <input
                  ref={avatarFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  tabIndex={-1}
                  aria-label={t("account:ME_PROFILE_AVATAR_CHANGE")}
                  disabled={isAvatarBusy}
                  onChange={handleAvatarFileChange}
                />
                <AvatarUploadSlot
                  size={40}
                  shape="circle"
                  disabled={isAvatarBusy}
                  loading={isAvatarBusy}
                  src={
                    resolveAssetRefToPublicUrlPath(
                      props.profile.avatarUrl ?? props.profile.avatarAssetId,
                    ) ?? undefined
                  }
                  fallback={initialsFromName(
                    displayNameFallback === "-" ? "User" : displayNameFallback,
                  )}
                  uploadAriaLabel={t("account:ME_PROFILE_AVATAR_CHANGE")}
                  removeAriaLabel={t("account:ME_PROFILE_AVATAR_REMOVE")}
                  canRemove={Boolean(props.profile.avatarUrl || props.profile.avatarAssetId)}
                  onPick={() => avatarFileInputRef.current?.click()}
                  onRemove={() => void updateAvatarMutation.mutateAsync(null)}
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-6">
              <div className="min-w-0 shrink-0">
                <div className="text-body font-medium text-label-primary">
                  {t("account:ME_PROFILE_DISPLAY_NAME_TITLE")}
                </div>
              </div>
              {isEditingName ? (
                <div className="flex w-full min-w-0 max-w-sm flex-col gap-1.5">
                  <div className="flex items-center gap-2">
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
                    <Button
                      variant="outline"
                      disabled={
                        (displayNameDirty && !isDisplayNameValid) || updateProfileMutation.isPending
                      }
                      loading={updateProfileMutation.isPending}
                      onClick={() => {
                        // Saving an unchanged value acts as the way out of edit mode.
                        if (!hasDisplayNameChanged) {
                          setIsEditingName(false);
                          return;
                        }
                        setConfirmDisplayNameOpen(true);
                      }}
                      className="h-10 shrink-0 px-5 font-medium"
                    >
                      {t("settings:SETTINGS_SAVE")}
                    </Button>
                  </div>
                  {displayNameDirty && !isDisplayNameValid && (
                    <div className="flex items-center justify-end gap-1.5 text-footnote text-destructive">
                      <AlertCircle className="h-4 w-4" />
                      {t("account:ME_PROFILE_DISPLAY_NAME_INVALID")}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="truncate text-body text-label-primary"
                    title={displayNameFallback}
                  >
                    {displayNameFallback}
                  </span>
                  <Button
                    variant="outline"
                    className="h-10 shrink-0 px-5 font-medium"
                    onClick={() => setIsEditingName(true)}
                  >
                    {t("common:EDIT")}
                  </Button>
                </div>
              )}
            </div>

            <UserProfileUserIdSection userId={props.profile.id} />
          </div>
        </SettingCardContent>
      </SettingCard>

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
              variant="primary"
              disabled={!canSaveDisplayName}
              loading={updateProfileMutation.isPending}
              onClick={() => {
                void updateProfileMutation.mutateAsync({ displayName: nextDisplayNameNormalized });
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
    </>
  );
}
