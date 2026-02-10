import type { SetupSiteDraft, SetupWorkspaceTemplate } from "@/stores/use-setup-wizard-store";

type SetupTranslate = (key: string, params?: Record<string, unknown>) => string;

export interface ApplyWorkspaceTemplatePresetParams {
  templateKey: SetupWorkspaceTemplate;
  organizationName: string;
  siteUrl: string;
  t: SetupTranslate;
}

export const SETUP_WORKSPACE_TEMPLATE_KEYS: SetupWorkspaceTemplate[] = ["blog", "website", "blank"];

function normalizeOrganizationName(name: string): string {
  const raw = name.trim();
  return raw || "Celestial";
}

function resolveOptionalTranslation(t: SetupTranslate, key: string, params: Record<string, unknown>): string {
  const value = t(key, params);
  return value === key ? "" : value;
}

export function applyWorkspaceTemplatePreset(
  params: ApplyWorkspaceTemplatePresetParams,
): Partial<SetupSiteDraft> {
  const { templateKey, siteUrl, t } = params;
  const orgName = normalizeOrganizationName(params.organizationName);

  if (templateKey === "blog") {
    return {
      templateKey,
      workspaceName: t("setup:SETUP_TEMPLATE_BLOG_WORKSPACE", { orgName }),
      siteName: t("setup:SETUP_TEMPLATE_BLOG_SITE", { orgName }),
      siteUrl,
      siteDescription: t("setup:SETUP_TEMPLATE_BLOG_DESC", { orgName }),
    };
  }

  if (templateKey === "website") {
    return {
      templateKey,
      workspaceName: t("setup:SETUP_TEMPLATE_WEBSITE_WORKSPACE", { orgName }),
      siteName: t("setup:SETUP_TEMPLATE_WEBSITE_SITE", { orgName }),
      siteUrl,
      siteDescription: t("setup:SETUP_TEMPLATE_WEBSITE_DESC", { orgName }),
    };
  }

  return {
    templateKey,
    workspaceName: t("setup:SETUP_TEMPLATE_BLANK_WORKSPACE", { orgName }),
    siteName: t("setup:SETUP_TEMPLATE_BLANK_SITE", { orgName }),
    siteUrl,
    siteDescription: resolveOptionalTranslation(t, "setup:SETUP_TEMPLATE_BLANK_DESC", { orgName }),
  };
}
