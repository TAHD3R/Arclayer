import { useTranslation } from "react-i18next";

import { AvatarUploadSlot } from "@/components/common/avatar-upload-slot";
import { initialsFromName } from "@/lib/auth/user-profile";
import { Input } from "@arclayer/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { Textarea } from "@arclayer/ui/textarea";
import type { RoleOption } from "../../types";
import { WelcomeFieldError } from "../welcome-field-error";

const WORKSPACE_NAME_MAX_LENGTH = 128;
const WORKSPACE_DESCRIPTION_MAX_LENGTH = 256;

export function WorkspaceCreateStep(props: {
  name: string;
  description: string;
  iconUrl: string | null;
  defaultRoleCode: string;
  roleOptions: RoleOption[];
  errors: Record<string, string | null>;
  iconBusy: boolean;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onPickIcon: () => void;
  onRemoveIcon: () => void;
  onDefaultRoleCodeChange: (value: string) => void;
}) {
  const { t } = useTranslation(["onboarding", "settings", "common"]);
  const fallbackName = props.name || t("common:ORG_WORKSPACES_FIELD_NAME_PLACEHOLDER");

  return (
    <div className="flex flex-col gap-5 py-6">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="workspace-name" className="text-headline text-label-primary">
          {t("onboarding:WELCOME_WORKSPACE_IDENTITY_TITLE")}
        </label>
        <div className="flex flex-row items-start gap-6 sm:gap-8">
          <AvatarUploadSlot
            size={80}
            shape="square"
            src={props.iconUrl ?? undefined}
            fallback={initialsFromName(fallbackName)}
            disabled={props.iconBusy}
            loading={props.iconBusy}
            uploadAriaLabel={t("common:ORG_WORKSPACES_ACTION_CHANGE_ICON")}
            removeAriaLabel={t("common:ORG_WORKSPACES_ICON_REMOVE_PHOTO_LABEL")}
            canRemove={Boolean(props.iconUrl)}
            onPick={props.onPickIcon}
            onRemove={props.onRemoveIcon}
          />

          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-1.5">
              <Input
                id="workspace-name"
                aria-label={t("settings:SETTINGS_WORKSPACE_NAME_LABEL")}
                value={props.name}
                onChange={(event) => props.onNameChange(event.target.value)}
                maxLength={WORKSPACE_NAME_MAX_LENGTH}
                className="h-10 w-full text-body"
                placeholder={t("settings:SETTINGS_WORKSPACE_NAME_PLACEHOLDER")}
                aria-invalid={Boolean(props.errors.name)}
              />
              <div className="text-footnote text-label-secondary">
                {`${props.name.length}/${WORKSPACE_NAME_MAX_LENGTH}`}
              </div>
              {props.errors.name ? (
                <WelcomeFieldError>{props.errors.name}</WelcomeFieldError>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="workspace-description" className="text-headline text-label-primary">
          {t("common:ORG_WORKSPACES_FIELD_DESCRIPTION")}
        </label>
        <Textarea
          id="workspace-description"
          rows={3}
          value={props.description}
          onChange={(event) => props.onDescriptionChange(event.target.value)}
          maxLength={WORKSPACE_DESCRIPTION_MAX_LENGTH}
          placeholder={t("common:ORG_WORKSPACES_FIELD_DESCRIPTION_PLACEHOLDER")}
          className="resize-none text-body"
        />
        <div className="text-footnote text-label-secondary">
          {`${props.description.length}/${WORKSPACE_DESCRIPTION_MAX_LENGTH}`}
        </div>
      </div>

      <SettingDialogFields>
        <SettingDialogField
          title={t("settings:SETTINGS_WORKSPACE_DEFAULT_ROLE_TITLE")}
          error={
            props.errors.defaultRoleCode ? (
              <WelcomeFieldError>{props.errors.defaultRoleCode}</WelcomeFieldError>
            ) : undefined
          }
        >
          <Select value={props.defaultRoleCode} onValueChange={props.onDefaultRoleCodeChange}>
            <SelectTrigger className="w-full" aria-invalid={Boolean(props.errors.defaultRoleCode)}>
              <SelectValue placeholder={t("onboarding:WELCOME_INVITE_ROLE_PLACEHOLDER")} />
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              {props.roleOptions.map((option) => (
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
