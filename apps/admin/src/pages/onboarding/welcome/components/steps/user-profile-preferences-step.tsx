import { useTranslation } from "react-i18next";

import { AvatarUploadCompletionNotice } from "@/components/common/avatar-upload-completion-notice";
import { AvatarUploadSlot } from "@/components/common/avatar-upload-slot";
import { initialsFromName } from "@/lib/auth/user-profile";
import { Checkbox } from "@arclayer/ui/checkbox";
import { Input } from "@arclayer/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { WelcomeFieldError } from "../welcome-field-error";

type ProfileSelectOption = {
  label: string;
  value: string;
};

export function UserProfilePreferencesStep(props: {
  displayName: string;
  avatarUrl: string | null;
  jobRole: string | null;
  companySize: string | null;
  subscribedProductUpdates: boolean;
  jobRoleOptions: ProfileSelectOption[];
  companySizeOptions: ProfileSelectOption[];
  displayNameError: string | null;
  avatarBusy: boolean;
  avatarCompletionRequired: boolean;
  avatarCompletionBusy: boolean;
  onDisplayNameChange: (value: string) => void;
  onJobRoleChange: (value: string) => void;
  onCompanySizeChange: (value: string) => void;
  onSubscribedProductUpdatesChange: (checked: boolean) => void;
  onPickAvatar: () => void;
  onContinueAvatarCompletion: () => void;
  onRemoveAvatar: () => void;
}) {
  const { t } = useTranslation(["onboarding", "account"]);

  return (
    <div className="flex flex-col gap-6 py-6">
      <SettingDialogField
        title={t("onboarding:WELCOME_PROFILE_IDENTITY_TITLE")}
        error={
          props.displayNameError ? (
            <WelcomeFieldError>{props.displayNameError}</WelcomeFieldError>
          ) : undefined
        }
      >
        <div className="flex items-start gap-5">
          <AvatarUploadSlot
            size={80}
            shape="circle"
            src={props.avatarUrl ?? undefined}
            fallback={initialsFromName(props.displayName || "User")}
            disabled={props.avatarBusy || props.avatarCompletionRequired}
            loading={props.avatarBusy}
            uploadAriaLabel={t("account:ME_PROFILE_AVATAR_CHANGE")}
            removeAriaLabel={t("account:ME_PROFILE_AVATAR_REMOVE")}
            canRemove={Boolean(props.avatarUrl)}
            onPick={props.onPickAvatar}
            onRemove={props.onRemoveAvatar}
          />
          <div className="min-w-0 flex-1 space-y-2">
            <Input
              id="welcome-display-name"
              aria-label={t("account:ME_PROFILE_DISPLAY_NAME_TITLE")}
              value={props.displayName}
              onChange={(event) => props.onDisplayNameChange(event.target.value)}
              maxLength={64}
              aria-invalid={Boolean(props.displayNameError)}
              placeholder={t("account:ME_PROFILE_DISPLAY_NAME_PLACEHOLDER")}
            />
            <div className="text-footnote text-label-secondary">
              {`${props.displayName.length}/64`}
            </div>
            {props.avatarCompletionRequired ? (
              <AvatarUploadCompletionNotice
                description={t("account:ME_PROFILE_AVATAR_COMPLETION_PENDING")}
                actionLabel={t("account:ME_PROFILE_AVATAR_COMPLETION_ACTION")}
                pending={props.avatarCompletionBusy}
                onContinue={props.onContinueAvatarCompletion}
              />
            ) : null}
          </div>
        </div>
      </SettingDialogField>

      <SettingDialogFields>
        <SettingDialogField title={t("onboarding:WELCOME_PROFILE_JOB_ROLE_TITLE")}>
          <Select value={props.jobRole ?? ""} onValueChange={props.onJobRoleChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("onboarding:WELCOME_PROFILE_JOB_ROLE_PLACEHOLDER")} />
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              {props.jobRoleOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingDialogField>

        <SettingDialogField title={t("onboarding:WELCOME_PROFILE_COMPANY_SIZE_TITLE")}>
          <Select value={props.companySize ?? ""} onValueChange={props.onCompanySizeChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("onboarding:WELCOME_PROFILE_COMPANY_SIZE_PLACEHOLDER")} />
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              {props.companySizeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingDialogField>

        <div data-testid="product-updates-field" className="flex min-w-0 items-start gap-3">
          <Checkbox
            aria-label={t("onboarding:WELCOME_PROFILE_PRODUCT_UPDATES_TITLE")}
            checked={props.subscribedProductUpdates}
            className="mt-0.5"
            onCheckedChange={props.onSubscribedProductUpdatesChange}
          />
          <div className="grid min-w-0 gap-1">
            <div data-testid="product-updates-title" className="text-headline text-label-primary">
              {t("onboarding:WELCOME_PROFILE_PRODUCT_UPDATES_TITLE")}
            </div>
            <div className="text-label-secondary">
              {t("onboarding:WELCOME_PROFILE_PRODUCT_UPDATES_DESC")}
            </div>
          </div>
        </div>
      </SettingDialogFields>
    </div>
  );
}
