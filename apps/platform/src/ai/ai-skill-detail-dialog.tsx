import { useTranslation } from "react-i18next";
import type {
  PlatformSkillPackageDetailOut,
  PlatformSkillVersionOut,
} from "@arclayer/platform-openapi";

import { latestPlatformSkillVersion } from "@/ai/ai-skill-form-model";
import { SettingDialog } from "@/components/setting-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function PlatformSkillDetailDialog({
  skill,
  open,
  onOpenChange,
}: Readonly<{
  skill: PlatformSkillPackageDetailOut | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  const { t } = useTranslation("ai");
  if (!skill) return null;
  const version = latestPlatformSkillVersion(skill);
  const name = skill.displayNameKey ? t(skill.displayNameKey) : skill.displayName;
  const description = skill.descriptionKey ? t(skill.descriptionKey) : skill.description;

  return (
    <SettingDialog
      contentClassName="sm:max-w-4xl"
      description={description}
      footer={
        <Button onClick={() => onOpenChange(false)} variant="outline">
          {t("CLOSE")}
        </Button>
      }
      onOpenChange={onOpenChange}
      open={open}
      title={name}
    >
      {version ? <SkillContent version={version} /> : <p>{t("SKILL_DETAIL_CONTENT_EMPTY")}</p>}
    </SettingDialog>
  );
}

function SkillContent({ version }: Readonly<{ version: PlatformSkillVersionOut }>) {
  const { t } = useTranslation("ai");
  const instructions = version.resources.find(
    (resource) => resource.role === "instructions",
  )?.content;
  const references = version.resources.filter((resource) => resource.role === "reference");
  return (
    <div className="space-y-7">
      {version.manifest.capabilityTags?.length ? (
        <div className="flex flex-wrap gap-2">
          {version.manifest.capabilityTags.map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
            </Badge>
          ))}
        </div>
      ) : null}
      <ContentSection title={t("SKILL_FIELD_INSTRUCTIONS")}>
        <pre className="whitespace-pre-wrap rounded-lg bg-muted/45 p-4 font-sans text-sm leading-6">
          {instructions ?? t("SKILL_DETAIL_INSTRUCTIONS_EMPTY")}
        </pre>
      </ContentSection>
      {references.length ? (
        <ContentSection title={t("SKILL_FIELD_REFERENCES")}>
          <div className="grid gap-3">
            {references.map((reference) => (
              <article className="rounded-lg border p-4" key={reference.path}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="font-mono text-sm font-medium">{reference.path}</h4>
                  <Badge variant="outline">{reference.mimeType}</Badge>
                </div>
                <pre className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                  {reference.content}
                </pre>
              </article>
            ))}
          </div>
        </ContentSection>
      ) : null}
      {version.manifest.requiredTools?.length ? (
        <ContentSection title={t("SKILL_FIELD_REQUIRED_TOOLS")}>
          <div className="grid gap-3 sm:grid-cols-2">
            {version.manifest.requiredTools.map((tool) => (
              <DeclarationCard key={tool.toolId} title={tool.toolId} detail={tool.intendedUse}>
                {tool.versionRange ? <Badge variant="outline">{tool.versionRange}</Badge> : null}
              </DeclarationCard>
            ))}
          </div>
        </ContentSection>
      ) : null}
      {version.manifest.permissions?.length ? (
        <ContentSection title={t("SKILL_FIELD_PERMISSIONS")}>
          <div className="grid gap-3 sm:grid-cols-2">
            {version.manifest.permissions.map((permission) => (
              <DeclarationCard
                detail={permission.purpose}
                key={permission.action}
                title={permission.action}
              />
            ))}
          </div>
        </ContentSection>
      ) : null}
      {version.manifest.dataEgress?.length ? (
        <ContentSection title={t("SKILL_FIELD_DATA_EGRESS")}>
          <div className="grid gap-3 sm:grid-cols-2">
            {version.manifest.dataEgress.map((egress) => (
              <DeclarationCard
                detail={egress.purpose}
                key={`${egress.destination}-${egress.dataClasses.join("-")}`}
                title={egress.destination}
              >
                <div className="flex flex-wrap gap-1.5">
                  {egress.dataClasses.map((dataClass) => (
                    <Badge key={dataClass} variant="outline">
                      {dataClass}
                    </Badge>
                  ))}
                </div>
              </DeclarationCard>
            ))}
          </div>
        </ContentSection>
      ) : null}
      {version.validation.findings.length ? (
        <ContentSection title={t("SKILL_DETAIL_FINDINGS")}>
          <ul className="grid gap-2">
            {version.validation.findings.map((finding, index) => (
              <li
                className="flex items-start gap-3 rounded-lg border p-3 text-sm"
                key={`${finding.code}-${index}`}
              >
                <Badge
                  className="mt-0.5"
                  variant={finding.severity === "error" ? "destructive" : "outline"}
                >
                  {t(
                    finding.severity === "error" ? "SKILL_FINDING_ERROR" : "SKILL_FINDING_WARNING",
                  )}
                </Badge>
                <span>{finding.message}</span>
              </li>
            ))}
          </ul>
        </ContentSection>
      ) : null}
    </div>
  );
}

function ContentSection({
  title,
  children,
}: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function DeclarationCard({
  title,
  detail,
  children,
}: Readonly<{ title: string; detail: string; children?: React.ReactNode }>) {
  return (
    <article className="rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <h4 className="break-all font-mono text-sm font-medium">{title}</h4>
        {children}
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
    </article>
  );
}
