import { useMemo } from "react";

import { useTranslation } from "react-i18next";
import { Bell, Shield, SlidersHorizontal, UserRound, X, type LucideIcon } from "lucide-react";

import { ComplexDialog } from "@celestial/ui/complex-dialog";
import { cn } from "@celestial/lib/utils";
import { MiniCategoryNav } from "@celestial/ui/mini-category-nav";
import { Button as ButtonPrimitive } from "@celestial/ui/button-primitive";
import { MeNotificationSettingsPage } from "@/pages/me/notifications/page";
import { MePreferencesView } from "@/pages/me/preferences/components/me-preferences-view";
import { MeProfileView } from "@/pages/me/profile/components/me-profile-view";
import { MeSecurityView } from "@/pages/me/security/components/me-security-view";
import { type MeSettingsDialogTab } from "@/stores/use-me-settings-dialog-store";

type MeSettingsDialogProps = {
  open: boolean;
  tab: MeSettingsDialogTab;
  onOpenChange: (open: boolean) => void;
  onTabChange: (tab: MeSettingsDialogTab) => void;
};

type MeSettingsTabItem = {
  key: MeSettingsDialogTab;
  label: string;
  icon: LucideIcon;
};

const ME_SETTINGS_DIALOG_CONTENT_CLASSNAME = cn(
  "rounded-[14px]",
  "w-[90vw]! max-w-[1512px]!",
  "h-[calc(100%-100px)]! max-h-[calc(100%-100px)]!",
  "[&>div]:h-full [&>div]:min-h-0",
);

function buildTabItems(labels: Record<MeSettingsDialogTab, string>): readonly MeSettingsTabItem[] {
  return [
    { key: "profile", label: labels.profile, icon: UserRound },
    { key: "preferences", label: labels.preferences, icon: SlidersHorizontal },
    { key: "security", label: labels.security, icon: Shield },
    { key: "notifications", label: labels.notifications, icon: Bell },
  ] as const;
}

function MeSettingsDialogCloseButton(props: { onClose: () => void; label: string }) {
  return (
    <ButtonPrimitive
      type="button"
      onClick={props.onClose}
      aria-label={props.label}
      hoverScale={1}
      tapScale={1}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-full",
        "text-label-secondary transition-colors hover:bg-accent hover:text-label-primary",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <X className="h-4 w-4" />
    </ButtonPrimitive>
  );
}

function MeSettingsTabNavigation(props: {
  items: readonly MeSettingsTabItem[];
  selectedTab: MeSettingsDialogTab;
  onTabChange: (tab: MeSettingsDialogTab) => void;
  ariaLabel: string;
}) {
  const navItems = useMemo(
    () =>
      props.items.map((item) => {
        const Icon = item.icon;
        return {
          key: item.key,
          icon: <Icon className="h-4 w-4" aria-hidden="true" />,
          label: item.label,
        } as const;
      }),
    [props.items],
  );

  return (
    <MiniCategoryNav
      ariaLabel={props.ariaLabel}
      items={navItems}
      selectedKey={props.selectedTab}
      onSelect={(key) => props.onTabChange(key as MeSettingsDialogTab)}
      className="px-2 py-3"
      itemClassName="text-footnote"
      itemHeightClassName="h-10"
    />
  );
}

function MeSettingsDialogContent(props: { tab: MeSettingsDialogTab }) {
  if (props.tab === "profile") {
    return <MeProfileView mode="dialog" />;
  }
  if (props.tab === "preferences") {
    return <MePreferencesView mode="dialog" />;
  }
  if (props.tab === "security") {
    return <MeSecurityView mode="dialog" />;
  }
  return <MeNotificationSettingsPage mode="dialog" />;
}

function MeSettingsDialogBody(props: {
  tab: MeSettingsDialogTab;
  tabItems: readonly MeSettingsTabItem[];
  onTabChange: (tab: MeSettingsDialogTab) => void;
  navAriaLabel: string;
}) {
  return (
    <div className="flex h-full min-h-0 bg-background">
      <aside className="h-full w-[250px] shrink-0 border-r bg-muted/45">
        <MeSettingsTabNavigation
          items={props.tabItems}
          selectedTab={props.tab}
          onTabChange={props.onTabChange}
          ariaLabel={props.navAriaLabel}
        />
      </aside>

      <section className="relative z-[1] flex min-h-0 flex-1 overflow-auto">
        <div className="flex w-full min-w-0 justify-center px-[clamp(18px,5vw,60px)] py-9">
          <div className="flex w-full max-w-[800px] min-w-0 flex-col gap-9">
            <div role="tabpanel" className="flex min-w-0 flex-col gap-9">
              <MeSettingsDialogContent tab={props.tab} />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export function MeSettingsDialog(props: MeSettingsDialogProps) {
  const { t } = useTranslation(["account", "common"]);
  const navAriaLabel = t("account:ME_TITLE");
  const closeLabel = t("common:CANCEL");
  const tabDescriptions = useMemo(
    () =>
      ({
        profile: t("account:ME_TAB_PROFILE_DESC"),
        preferences: t("account:ME_TAB_PREFERENCES_DESC"),
        security: t("account:ME_TAB_SECURITY_DESC"),
        notifications: t("account:ME_TAB_NOTIFICATIONS_DESC"),
      }) satisfies Record<MeSettingsDialogTab, string>,
    [t],
  );

  const tabItems = useMemo(
    () =>
      buildTabItems({
        profile: t("account:ME_TAB_PROFILE"),
        preferences: t("account:ME_TAB_PREFERENCES"),
        security: t("account:ME_TAB_SECURITY"),
        notifications: t("account:ME_TAB_NOTIFICATIONS"),
      }),
    [t],
  );
  const currentDescription = tabDescriptions[props.tab];

  return (
    <ComplexDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      size="xl"
      title={navAriaLabel}
      description={currentDescription}
      headerRight={
        <MeSettingsDialogCloseButton onClose={() => props.onOpenChange(false)} label={closeLabel} />
      }
      headerClassName="px-7 py-5"
      bodyClassName="h-full min-h-0 p-0! overflow-hidden!"
      contentClassName={ME_SETTINGS_DIALOG_CONTENT_CLASSNAME}
    >
      <MeSettingsDialogBody
        tab={props.tab}
        tabItems={tabItems}
        onTabChange={props.onTabChange}
        navAriaLabel={navAriaLabel}
      />
    </ComplexDialog>
  );
}
