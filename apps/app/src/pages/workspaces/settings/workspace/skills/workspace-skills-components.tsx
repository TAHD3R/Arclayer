import { useTranslation } from "react-i18next";

import { Badge } from "@arclayer/ui/badge";

function statusVariant(status: string) {
  if (["valid", "enabled", "active"].includes(status)) return "default" as const;
  if (["warning", "candidate", "disabled"].includes(status)) return "secondary" as const;
  if (["invalid", "quarantined", "failed", "incompatible"].includes(status)) {
    return "destructive" as const;
  }
  return "outline" as const;
}

export function SkillStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation("settings");
  return (
    <Badge variant={statusVariant(status)}>
      {t(`SETTINGS_WORKSPACE_SKILLS_STATUS_${status.toUpperCase()}`)}
    </Badge>
  );
}

export function WorkspaceSkillsScopeEmpty() {
  const { t } = useTranslation("settings");
  return (
    <div className="flex min-h-[28rem] items-center justify-center" role="status">
      <p className="text-body text-label-tertiary">{t("SETTINGS_WORKSPACE_SKILLS_SCOPE_EMPTY")}</p>
    </div>
  );
}
