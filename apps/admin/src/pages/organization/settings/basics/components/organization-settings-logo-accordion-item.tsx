import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { AvatarUploadSlot } from "@/components/common/avatar-upload-slot";
import { SettingAccordionItem } from "@celestial/ui/setting-accordion-item";
import { resolvePublicAssetUrlPath } from "@/lib/assets/asset-urls";
import { uploadSingleAssetFromFile } from "@/lib/assets/scoped-uploads";
import { notifyError, notifySuccessText } from "@/lib/notifications";

import type { OrganizationSettingsBasicsController } from "../hooks/use-organization-settings-basics-controller";

export function OrganizationSettingsLogoAccordionItem(props: {
  controller: OrganizationSettingsBasicsController;
}) {
  const c = props.controller;
  const { t } = c;
  const { t: tGlobal } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const logoUrl = String(c.currentOrgLogoUrl || "").trim();
  const logoPreviewUrl = resolvePublicAssetUrlPath(logoUrl);
  const orgIdForAssets = c.myOrgQuery.data?.organization.id ?? c.organizationId;

  return (
    <SettingAccordionItem
      value="organization_logo"
      variant="action"
      title={t("settings:SETTINGS_ORG_LOGO_LABEL")}
      description={t("settings:SETTINGS_ORG_LOGO_ITEM_DESC")}
      showSummary
      summary={logoUrl}
      placeholder={t("settings:SETTINGS_NOT_SET")}
      keepRendered
      disabled={c.disabled || !c.coreQuery.data}
      confirmText={t("settings:SETTINGS_SAVE")}
      confirmLoading={c.savingKey === "organization:logo"}
      onConfirm={() =>
        void c.withSavingKey("organization:logo", async () => {
          const raw = String(c.form.getValues("logoUrl") || "").trim();
          await c.patchCoreMutation.mutateAsync({ organizationLogoUrl: raw || null });
        })
      }
      onReset={
        c.isOrgLogoDirty
          ? () =>
              void c.withSavingKey("reset:organization:logo", async () => {
                c.form.setValue("logoUrl", c.initialOrgLogoUrl, { shouldDirty: false });
                c.form.clearErrors("logoUrl");
                const raw = String(c.initialOrgLogoUrl || "").trim();
                await c.patchCoreMutation.mutateAsync({ organizationLogoUrl: raw || null });
              })
          : undefined
      }
      resetText={t("settings:SETTINGS_RESET")}
      resetLoading={c.savingKey === "reset:organization:logo"}
    >
      <AvatarUploadSlot
        src={logoPreviewUrl}
        fallback={
          <span className="text-caption text-label-secondary">
            {t("settings:SETTINGS_NOT_SET")}
          </span>
        }
        shape="square"
        size={80}
        disabled={c.disabled || !c.coreQuery.data}
        loading={isUploading}
        uploadAriaLabel={t("settings:SETTINGS_ASSET_PICKER_SELECT")}
        removeAriaLabel={t("settings:SETTINGS_ASSET_PICKER_CLEAR")}
        canRemove={Boolean(logoUrl)}
        onPick={() => fileInputRef.current?.click()}
        onRemove={() => c.form.setValue("logoUrl", "", { shouldDirty: true })}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          e.target.value = "";
          if (!file) return;
          if (!file.type?.startsWith("image/")) {
            notifyError(new Error(tGlobal("assets:ASSET_UPLOAD_IMAGE_ONLY_REQUIRED")));
            return;
          }

          setIsUploading(true);
          uploadSingleAssetFromFile({
            scope: { type: "organization", id: orgIdForAssets },
            purpose: "site_logo",
            file,
            t: tGlobal,
          })
            .then((assetId) => {
              c.form.setValue("logoUrl", `/assets/${assetId}`, { shouldDirty: true });
              notifySuccessText(tGlobal("assets:ASSET_UPLOAD_SUCCESS"));
            })
            .catch((err) => notifyError(err))
            .finally(() => setIsUploading(false));
        }}
      />
    </SettingAccordionItem>
  );
}
