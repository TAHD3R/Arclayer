import { Save } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PlatformSignInSettingsOut } from "@arclayer/platform-openapi";

import { getCurrentPlatformTeamIdentity, getSignInSettings } from "@/access/access-api";
import { AccessPage, AccessQueryState, useAccessQuery } from "@/access/access-ui";
import {
  PLATFORM_SIGN_IN_POLICY_FORM_ID,
  PlatformSignInPolicyForm,
} from "@/access/platform-sign-in-policy-form";
import { PlatformSignInProviderSettings } from "@/access/platform-sign-in-provider-settings";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type SignInSettingsTab = "policy" | "providers";

export function PlatformSignInSettingsPage() {
  const { t } = useTranslation("access");
  const [activeTab, setActiveTab] = useState<SignInSettingsTab>("policy");
  const [policyPending, setPolicyPending] = useState(false);
  const [settingsOverride, setSettingsOverride] = useState<PlatformSignInSettingsOut | null>(null);
  const load = useCallback(async () => {
    const [settings, identity] = await Promise.all([
      getSignInSettings(),
      getCurrentPlatformTeamIdentity(),
    ]);
    return { settings, identity };
  }, []);
  const { state, retry } = useAccessQuery(load, []);
  const identity = state.status === "ready" ? state.data.identity : null;
  const canManageSettings = Boolean(
    identity &&
    (identity.isInstanceOwner ||
      identity.effectivePermissions.includes("platform:access-sign-in-settings:manage")),
  );
  const refresh = () => {
    setSettingsOverride(null);
    retry();
  };

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => {
        if (value === "policy" || value === "providers") setActiveTab(value);
      }}
    >
      <AccessPage
        description={t("SIGN_IN_SETTINGS_DESCRIPTION")}
        extra={
          <div className="overflow-x-auto pb-1">
            <TabsList className="w-max justify-start">
              <TabsTrigger value="policy">{t("SIGN_IN_POLICY_TAB")}</TabsTrigger>
              <TabsTrigger value="providers">{t("OAUTH_PROVIDERS_TAB")}</TabsTrigger>
            </TabsList>
          </div>
        }
        primaryAction={
          activeTab === "policy" && canManageSettings ? (
            <Button disabled={policyPending} form={PLATFORM_SIGN_IN_POLICY_FORM_ID} type="submit">
              <Save aria-hidden="true" />
              {policyPending ? t("SAVING") : t("SAVE_SIGN_IN_SETTINGS")}
            </Button>
          ) : undefined
        }
        title={t("SIGN_IN_SETTINGS_TITLE")}
      >
        <AccessQueryState isEmpty={() => false} retry={refresh} state={state}>
          {({ settings, identity }) => {
            const currentSettings = settingsOverride ?? settings;
            const canManageSettings =
              identity.isInstanceOwner ||
              identity.effectivePermissions.includes("platform:access-sign-in-settings:manage");
            return (
              <>
                <TabsContent className="mt-5" value="policy">
                  <PlatformSignInPolicyForm
                    canManage={canManageSettings}
                    key={currentSettings.revision}
                    settings={currentSettings}
                    onChanged={setSettingsOverride}
                    onPendingChange={setPolicyPending}
                  />
                </TabsContent>
                <TabsContent className="mt-5" value="providers">
                  <PlatformSignInProviderSettings
                    canManage={canManageSettings}
                    providers={currentSettings.providers}
                    revision={currentSettings.revision}
                    onChanged={setSettingsOverride}
                  />
                </TabsContent>
              </>
            );
          }}
        </AccessQueryState>
      </AccessPage>
    </Tabs>
  );
}
