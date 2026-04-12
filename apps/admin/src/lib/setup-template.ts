type SetupWorkspaceTemplate = "blog" | "website" | "blank";

type SetupSiteDraft = {
  templateKey: SetupWorkspaceTemplate;
  workspaceName: string;
  siteName: string;
  siteUrl: string;
  siteDescription?: string;
};

type SetupTranslate = (key: string, params?: Record<string, unknown>) => string;

export interface ApplyWorkspaceTemplatePresetParams {
  templateKey: SetupWorkspaceTemplate;
  displayName: string;
  siteUrl: string;
  t: SetupTranslate;
}

export const SETUP_WORKSPACE_TEMPLATE_KEYS: SetupWorkspaceTemplate[] = ["blog", "website", "blank"];

function normalizeDisplayName(name: string | null | undefined): string {
  const raw = (name || "").trim();
  return raw || "User";
}

function resolveOptionalTranslation(
  t: SetupTranslate,
  key: string,
  params: Record<string, unknown>,
): string {
  const value = t(key, params);
  return value === key ? "" : value;
}

export function applyWorkspaceTemplatePreset(
  params: ApplyWorkspaceTemplatePresetParams,
): Partial<SetupSiteDraft> {
  const { templateKey, siteUrl, t } = params;
  const displayName = normalizeDisplayName(params.displayName);
  const workspaceName = t("setup:SETUP_DEFAULT_WORKSPACE_NAME", { username: displayName });
  const siteName = t("setup:SETUP_DEFAULT_SITE_NAME", { username: displayName });

  if (templateKey === "blog") {
    return {
      templateKey,
      workspaceName,
      siteName,
      siteUrl,
      siteDescription: t("setup:SETUP_TEMPLATE_BLOG_DESC", { orgName: displayName }),
    };
  }

  if (templateKey === "website") {
    return {
      templateKey,
      workspaceName,
      siteName,
      siteUrl,
      siteDescription: t("setup:SETUP_TEMPLATE_WEBSITE_DESC", { orgName: displayName }),
    };
  }

  return {
    templateKey,
    workspaceName,
    siteName,
    siteUrl,
    siteDescription: resolveOptionalTranslation(t, "setup:SETUP_TEMPLATE_BLANK_DESC", {
      orgName: displayName,
    }),
  };
}
