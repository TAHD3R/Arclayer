import { CircleDashed, Github, ShieldAlert, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { SkillValidationResultOut, WorkspaceSkillsCapabilitiesOut } from "@arclayer/openapi";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import { Badge } from "@arclayer/ui/badge";

export function WorkspaceSkillsCapabilityBoundaries({
  capabilities,
}: {
  capabilities: WorkspaceSkillsCapabilitiesOut;
}) {
  const { t } = useTranslation("settings");
  const boundaries = [
    {
      icon: Github,
      available: capabilities.githubImportAvailable,
      title: t("SETTINGS_WORKSPACE_SKILLS_GITHUB_TITLE"),
      description: t("SETTINGS_WORKSPACE_SKILLS_GITHUB_GATED"),
    },
  ].filter((boundary) => !boundary.available);
  if (!boundaries.length) return null;
  return (
    <section aria-labelledby="workspace-skills-boundaries-title">
      <div className="mb-3 flex items-center gap-2">
        <CircleDashed className="size-4 text-label-secondary" aria-hidden="true" />
        <h3 id="workspace-skills-boundaries-title" className="text-headline text-label-primary">
          {t("SETTINGS_WORKSPACE_SKILLS_ROLLOUT_TITLE")}
        </h3>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {boundaries.map((boundary) => {
          const Icon = boundary.icon;
          return (
            <Alert key={boundary.title} className="min-w-0">
              <Icon aria-hidden="true" />
              <AlertTitle className="flex flex-wrap items-center gap-2">
                {boundary.title}
                <Badge variant="outline">{t("SETTINGS_WORKSPACE_SKILLS_GATED")}</Badge>
              </AlertTitle>
              <AlertDescription>{boundary.description}</AlertDescription>
            </Alert>
          );
        })}
      </div>
    </section>
  );
}

export function WorkspaceSkillValidationFindings({
  validation,
}: {
  validation: SkillValidationResultOut;
}) {
  const { t } = useTranslation("settings");
  if (!validation.findings.length) {
    return (
      <Alert>
        <ShieldCheck aria-hidden="true" />
        <AlertTitle>{t("SETTINGS_WORKSPACE_SKILLS_VALIDATION_PASSED")}</AlertTitle>
        <AlertDescription>{t("SETTINGS_WORKSPACE_SKILLS_VALIDATION_PASSED_DESC")}</AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert variant={validation.status === "warning" ? "default" : "destructive"}>
      <ShieldAlert aria-hidden="true" />
      <AlertTitle>{t("SETTINGS_WORKSPACE_SKILLS_VALIDATION_FINDINGS")}</AlertTitle>
      <AlertDescription>
        <ul className="flex list-disc flex-col gap-2 pl-4">
          {validation.findings.map((finding, index) => (
            <li key={`${finding.code}:${finding.resourcePath ?? "package"}:${index}`}>
              <span>
                {t(`SETTINGS_WORKSPACE_SKILLS_FINDING_${finding.code}`, {
                  defaultValue: finding.message,
                })}
              </span>
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
