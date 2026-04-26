import { useTranslation } from "react-i18next";

import { AvatarUploadSlot } from "@/components/common/avatar-upload-slot";
import { initialsFromName } from "@/lib/auth/user-profile";
import { Input } from "@arclayer/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { Switch } from "@arclayer/ui/switch";
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
  onDisplayNameChange: (value: string) => void;
  onJobRoleChange: (value: string) => void;
  onCompanySizeChange: (value: string) => void;
  onSubscribedProductUpdatesChange: (checked: boolean) => void;
  onPickAvatar: () => void;
  onRemoveAvatar: () => void;
}) {
  const { t } = useTranslation(["onboarding", "account"]);

  return (
    <div className="flex flex-col gap-6 py-6">
      <div className="flex items-start gap-5">
        <AvatarUploadSlot
          size={80}
          shape="circle"
          src={props.avatarUrl ?? undefined}
          fallback={initialsFromName(props.displayName || "User")}
          disabled={props.avatarBusy}
          loading={props.avatarBusy}
          uploadAriaLabel={t("account:ME_PROFILE_AVATAR_CHANGE")}
          removeAriaLabel={t("account:ME_PROFILE_AVATAR_REMOVE")}
          canRemove={Boolean(props.avatarUrl)}
          onPick={props.onPickAvatar}
          onRemove={props.onRemoveAvatar}
        />
        <div className="min-w-0 flex-1 space-y-2">
          <SettingDialogField
            title={t("account:ME_PROFILE_DISPLAY_NAME_TITLE")}
            error={
              props.displayNameError ? (
                <WelcomeFieldError>{props.displayNameError}</WelcomeFieldError>
              ) : undefined
            }
          >
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
          </SettingDialogField>
        </div>
      </div>

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

        <div className="flex min-w-0 items-center justify-between gap-4">
          <div className="grid min-w-0 gap-1">
            <div className="text-headline text-label-primary">
              {t("onboarding:WELCOME_PROFILE_PRODUCT_UPDATES_TITLE")}
            </div>
            <div className="text-label-secondary">
              {t("onboarding:WELCOME_PROFILE_PRODUCT_UPDATES_DESC")}
            </div>
          </div>
          <Switch
            aria-label={t("onboarding:WELCOME_PROFILE_PRODUCT_UPDATES_TITLE")}
            checked={props.subscribedProductUpdates}
            onCheckedChange={props.onSubscribedProductUpdatesChange}
          />
        </div>
      </SettingDialogFields>
    </div>
  );
}
