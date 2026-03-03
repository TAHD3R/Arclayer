import { Button } from "antd";
import { Upload } from "lucide-react";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@celestial/ui/alert-dialog";
import {
  AlertDialogAction as AlertDialogActionPrimitive,
  AlertDialogCancel as AlertDialogCancelPrimitive,
} from "@celestial/ui/radix-primitives/radix-alert-dialog";
import { ContentGuard } from "@/components/common/content-guard";
import { DefaultPage } from "@/components/common/default-page";
import { ExtensionInstallDialog } from "./extension-install-dialog";
import {
  ChromeTabs,
  ChromeTabsContent,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@celestial/ui/chrome-tabs";

import type { ExtensionScope } from "../types";
import { useExtensions } from "../hooks/use-extensions";
import { ExtensionsExploreTab } from "./extensions-explore-tab";
import { ExtensionsInstalledTab } from "./extensions-installed-tab";

type ExtensionsViewProps = {
  scope?: ExtensionScope;
  organizationId?: string;
};

export function ExtensionsView({ scope = "workspace", organizationId }: ExtensionsViewProps) {
  const ext = useExtensions({ scope, organizationId });
  const { t, isOrganizationScope, workspaceId } = ext;

  const pageTitle = t("plugin:EXTENSION_PAGE_TITLE");
  const pageDescription = t("plugin:EXTENSION_PAGE_DESC");

  // --- Early returns ---

  if (!isOrganizationScope && !workspaceId) {
    return (
      <DefaultPage title={pageTitle} description={pageDescription}>
        <ContentGuard
          loading={false}
          empty
          emptyTitle={t("settings:SETTINGS_WORKSPACE_NOT_SELECTED_TITLE")}
          emptyDescription={t("settings:SETTINGS_WORKSPACE_NOT_SELECTED_DESC")}
        />
      </DefaultPage>
    );
  }

  if (ext.listQuery.isLoading && !ext.listQuery.data) {
    return (
      <DefaultPage title={pageTitle} description={pageDescription}>
        <ContentGuard loading loadingVariant="masonry" />
      </DefaultPage>
    );
  }

  if (ext.listQuery.isError) {
    return (
      <DefaultPage title={pageTitle} description={pageDescription}>
        <ContentGuard
          loading={false}
          error={ext.listQuery.error}
          onRetry={() => void ext.listQuery.refetch()}
        />
      </DefaultPage>
    );
  }

  return (
    <DefaultPage
      width="full"
      title={pageTitle}
      description={pageDescription}
      action={
        !isOrganizationScope ? (
          <Button
            autoInsertSpace={false}
            type="primary"
            icon={<Upload className="size-4" />}
            disabled={!ext.canManage}
            onClick={() => ext.setInstallOpen(true)}
          >
            {t("plugin:PLUGIN_CENTER_INSTALL_ACTION")}
          </Button>
        ) : undefined
      }
    >
      {!isOrganizationScope && ext.restartHint ? (
        <div className="mb-4 rounded-lg border border-border bg-card p-4 text-body">
          {t("plugin:PLUGIN_CENTER_RESTART_HINT")}
        </div>
      ) : null}

      <ChromeTabs defaultValue="explore">
        <ChromeTabsList>
          <ChromeTabsTrigger value="explore">{t("plugin:EXTENSION_TAB_EXPLORE")}</ChromeTabsTrigger>
          <ChromeTabsTrigger value="installed">
            {t("plugin:EXTENSION_TAB_INSTALLED")}
          </ChromeTabsTrigger>
        </ChromeTabsList>

        <ChromeTabsContent value="explore">
          <ExtensionsExploreTab
            scope={scope}
            categoryTabs={ext.categoryTabs}
            category={ext.category}
            onCategoryChange={ext.setCategory}
            searchQuery={ext.searchQuery}
            onSearchChange={ext.setSearchQuery}
            officialChecked={ext.officialChecked}
            communityChecked={ext.communityChecked}
            onOfficialChange={ext.setOfficialChecked}
            onCommunityChange={ext.setCommunityChecked}
            items={ext.explorePageItems}
            total={ext.exploreTotal}
            page={ext.page}
            pageSize={ext.pageSize}
            onPageChange={ext.setPage}
            buildConfigureHref={ext.buildConfigureHref}
            isEmpty={ext.filtered.length === 0}
          />
        </ChromeTabsContent>

        <ChromeTabsContent value="installed">
          <ExtensionsInstalledTab
            items={ext.installedPageItems}
            total={ext.installedTotal}
            page={ext.installedPage}
            pageSize={ext.pageSize}
            onPageChange={ext.setInstalledPage}
            buildConfigureHref={ext.buildConfigureHref}
            buildMenuItems={ext.buildMenuItems}
            isEmpty={ext.filteredInstalled.length === 0}
          />
        </ChromeTabsContent>
      </ChromeTabs>

      {!isOrganizationScope ? (
        <ExtensionInstallDialog
          workspaceId={workspaceId as string}
          open={ext.installOpen}
          onOpenChange={ext.setInstallOpen}
          disabled={!ext.canManage}
          onInstalled={ext.handleInstalled}
        />
      ) : null}

      <AlertDialog
        open={ext.confirm.open}
        onOpenChange={(open) =>
          open ? ext.setConfirm((prev) => ({ ...prev, open: true })) : ext.closeConfirm()
        }
      >
        <AlertDialogContent className="sm:max-w-[520px]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {ext.confirm.type === "reset"
                ? isOrganizationScope
                  ? t("plugin:PLUGIN_CENTER_ORG_RESET_CONFIRM_TITLE")
                  : t("plugin:PLUGIN_CENTER_RESET_CONFIRM_TITLE")
                : isOrganizationScope
                  ? t("plugin:PLUGIN_CENTER_ORG_UNINSTALL_CONFIRM_TITLE")
                  : t("plugin:PLUGIN_CENTER_UNINSTALL_CONFIRM_TITLE")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-body">
              {ext.confirm.type === "reset"
                ? isOrganizationScope
                  ? t("plugin:PLUGIN_CENTER_ORG_RESET_CONFIRM_DESC", {
                      name: ext.confirm.extension?.name || "",
                    })
                  : t("plugin:PLUGIN_CENTER_RESET_CONFIRM_DESC", {
                      name: ext.confirm.extension?.name || "",
                    })
                : isOrganizationScope
                  ? t("plugin:PLUGIN_CENTER_ORG_UNINSTALL_CONFIRM_DESC", {
                      name: ext.confirm.extension?.name || "",
                    })
                  : t("plugin:PLUGIN_CENTER_UNINSTALL_CONFIRM_DESC", {
                      name: ext.confirm.extension?.name || "",
                    })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancelPrimitive asChild>
              <Button
                autoInsertSpace={false}
                type="text"
                onClick={ext.closeConfirm}
                disabled={ext.confirmLoading}
              >
                {t("common:CANCEL")}
              </Button>
            </AlertDialogCancelPrimitive>
            <AlertDialogActionPrimitive asChild>
              <Button
                autoInsertSpace={false}
                type="primary"
                danger
                loading={ext.confirmLoading}
                onClick={() => void ext.handleConfirm()}
              >
                {t("common:CONFIRM")}
              </Button>
            </AlertDialogActionPrimitive>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DefaultPage>
  );
}
