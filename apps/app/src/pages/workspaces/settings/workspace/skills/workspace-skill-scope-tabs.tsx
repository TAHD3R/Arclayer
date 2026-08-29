import { useTranslation } from "react-i18next";

import { ChromeTabsList, ChromeTabsTrigger } from "@arclayer/ui/chrome-tabs";

export type WorkspaceSkillScope = "official" | "workspace" | "mine";

export function isWorkspaceSkillScope(value: string): value is WorkspaceSkillScope {
  return value === "official" || value === "workspace" || value === "mine";
}

export function WorkspaceSkillsScopeTabs() {
  const { t } = useTranslation("settings");
  return (
    <ChromeTabsList aria-label={t("SETTINGS_WORKSPACE_SKILLS_SCOPE_ARIA")}>
      <ChromeTabsTrigger value="official">
        {t("SETTINGS_WORKSPACE_SKILLS_SCOPE_OFFICIAL")}
      </ChromeTabsTrigger>
      <ChromeTabsTrigger value="workspace">
        {t("SETTINGS_WORKSPACE_SKILLS_SCOPE_WORKSPACE")}
      </ChromeTabsTrigger>
      <ChromeTabsTrigger value="mine">
        {t("SETTINGS_WORKSPACE_SKILLS_SCOPE_MINE")}
      </ChromeTabsTrigger>
    </ChromeTabsList>
  );
}
