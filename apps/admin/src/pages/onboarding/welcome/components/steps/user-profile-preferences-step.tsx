import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { AvatarUploadSlot } from "@/components/common/avatar-upload-slot";
import { initialsFromName } from "@/lib/auth/user-profile";
import { buildSupportedLocaleOptions, SUPPORTED_LOCALES, type AppLocale } from "@/lib/i18n";
import { buildTimezoneOptions } from "@/lib/settings/general/localization-options";
import { Input } from "@arclayer/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { WelcomeFieldError } from "../welcome-field-error";

export function UserProfilePreferencesStep(props: {
  displayName: string;
  avatarUrl: string | null;
  locale: AppLocale;
  timezone: string;
  displayNameError: string | null;
  avatarBusy: boolean;
  onDisplayNameChange: (value: string) => void;
  onLocaleChange: (value: AppLocale) => void;
  onTimezoneChange: (value: string) => void;
  onPickAvatar: () => void;
  onRemoveAvatar: () => void;
}) {
  const { t } = useTranslation(["onboarding", "account"]);
  const languageOptions = useMemo(() => buildSupportedLocaleOptions(SUPPORTED_LOCALES, t), [t]);
  const timezoneOptions = useMemo(() => buildTimezoneOptions(props.timezone), [props.timezone]);

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
        <SettingDialogField
          title={t("account:ACCOUNT_SETTINGS_LANGUAGE_LABEL")}
          description={t("account:ME_PREF_LANGUAGE_DESC")}
        >
          <Select
            value={props.locale}
            onValueChange={(value) => props.onLocaleChange(value as AppLocale)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              {languageOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingDialogField>

        <SettingDialogField
          title={t("account:ME_PREF_TIMEZONE_TITLE")}
          description={t("account:ME_PREF_TIMEZONE_DESC")}
        >
          <Select value={props.timezone} onValueChange={props.onTimezoneChange}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              {timezoneOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingDialogField>
      </SettingDialogFields>
    </div>
  );
}
