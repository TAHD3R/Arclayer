import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, CheckCircle2, CircleAlert, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { SkillInstallationCreateRequest, SkillManifestV1 } from "@arclayer/openapi";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import { Badge } from "@arclayer/ui/badge";
import { Button } from "@arclayer/ui/button";
import { Checkbox } from "@arclayer/ui/checkbox";
import { SettingDialog } from "@arclayer/ui/setting-dialog";

type Declaration = Readonly<{
  kind: "tool" | "permission" | "egress";
  identity: string;
  purpose: string;
  detail?: string;
}>;

type InstallableSkillVersion = Readonly<{
  id: string;
  packageId: string;
  versionNumber: number;
  semanticVersion?: string | null;
  packageChecksum: string;
  manifest: SkillManifestV1;
}>;

function declarationsFor(version: InstallableSkillVersion): Declaration[] {
  return [
    ...(version.manifest.requiredTools ?? []).map((item) => ({
      kind: "tool" as const,
      identity: item.toolId,
      purpose: item.intendedUse,
      detail: item.versionRange,
    })),
    ...(version.manifest.permissions ?? []).map((item) => ({
      kind: "permission" as const,
      identity: item.action,
      purpose: item.purpose,
    })),
    ...(version.manifest.dataEgress ?? []).map((item) => ({
      kind: "egress" as const,
      identity: item.destination,
      purpose: item.purpose,
      detail: item.dataClasses.join(", "),
    })),
  ];
}

function declarationKey(declaration: Declaration): string {
  return `${declaration.kind}:${declaration.identity}`;
}

export function WorkspaceSkillInstallDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  packageScope: "system" | "workspace";
  version: InstallableSkillVersion;
  validation: Readonly<{ status: string; findingHash: string }>;
  onSubmit: (payload: SkillInstallationCreateRequest) => Promise<void>;
}) {
  const { t } = useTranslation(["settings", "common"]);
  const declarations = useMemo(() => declarationsFor(props.version), [props.version]);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (props.open) setAccepted(new Set());
  }, [props.open]);

  const allAccepted = declarations.every((item) => accepted.has(declarationKey(item)));
  const toggle = (item: Declaration, checked: boolean) => {
    setAccepted((current) => {
      const next = new Set(current);
      const key = declarationKey(item);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const submit = async () => {
    if (!allAccepted) return;
    await props.onSubmit({
      packageScope: props.packageScope,
      packageId: props.version.packageId,
      versionId: props.version.id,
      expectedPackageChecksum: props.version.packageChecksum,
      validationFindingHash: props.validation.findingHash,
      acceptedRequiredTools: (props.version.manifest.requiredTools ?? []).map(
        (item) => item.toolId,
      ),
      acceptedPermissions: (props.version.manifest.permissions ?? []).map((item) => item.action),
      acceptedDataEgress: (props.version.manifest.dataEgress ?? []).map((item) => item.destination),
    });
    props.onOpenChange(false);
  };

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t("settings:SETTINGS_WORKSPACE_SKILLS_INSTALL_TITLE")}
      description={t("settings:SETTINGS_WORKSPACE_SKILLS_INSTALL_DESC", {
        version: props.version.versionNumber,
      })}
      footer={
        <>
          <Button
            variant="ghost"
            disabled={props.pending}
            onClick={() => props.onOpenChange(false)}
          >
            {t("common:CANCEL")}
          </Button>
          <Button loading={props.pending} disabled={!allAccepted} onClick={() => void submit()}>
            <ShieldCheck data-icon="inline-start" />
            {t("settings:SETTINGS_WORKSPACE_SKILLS_INSTALL_ACTION")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Alert>
          <CheckCircle2 aria-hidden="true" />
          <AlertTitle>{t("settings:SETTINGS_WORKSPACE_SKILLS_VALIDATION_PASSED")}</AlertTitle>
          <AlertDescription>
            {t("settings:SETTINGS_WORKSPACE_SKILLS_VALIDATION_EVIDENCE", {
              status: props.validation.status,
            })}
          </AlertDescription>
        </Alert>

        <div className="grid gap-3 rounded-lg border bg-muted/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-headline text-label-primary">
              {t("settings:SETTINGS_WORKSPACE_SKILLS_EXACT_VERSION")}
            </span>
            <Badge variant="outline" className="font-mono tabular-nums">
              v{props.version.versionNumber}
              {props.version.semanticVersion ? ` · ${props.version.semanticVersion}` : ""}
            </Badge>
          </div>
          <code className="break-all text-caption text-label-secondary">
            {props.version.packageChecksum}
          </code>
        </div>

        {declarations.length ? (
          <fieldset className="flex flex-col gap-3">
            <legend className="text-headline text-label-primary">
              {t("settings:SETTINGS_WORKSPACE_SKILLS_DECLARATIONS_TITLE")}
            </legend>
            <p className="text-footnote text-label-secondary">
              {t("settings:SETTINGS_WORKSPACE_SKILLS_DECLARATIONS_HELP")}
            </p>
            {declarations.map((declaration) => {
              const key = declarationKey(declaration);
              return (
                <label
                  key={key}
                  className="flex min-h-11 items-start gap-3 rounded-lg border px-3 py-3 transition-colors duration-100 hover:bg-accent/50"
                >
                  <Checkbox
                    className="mt-0.5"
                    checked={accepted.has(key)}
                    onCheckedChange={(checked) => toggle(declaration, checked === true)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-footnote font-semibold text-label-primary">
                        {declaration.identity}
                      </span>
                      <Badge variant="secondary">
                        {t(
                          `settings:SETTINGS_WORKSPACE_SKILLS_DECLARATION_${declaration.kind.toUpperCase()}`,
                        )}
                      </Badge>
                    </span>
                    <span className="mt-1 block text-footnote text-label-secondary">
                      {declaration.purpose}
                    </span>
                    {declaration.detail ? (
                      <span className="mt-1 block font-mono text-caption text-label-tertiary">
                        {declaration.detail}
                      </span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </fieldset>
        ) : (
          <Alert>
            <ShieldCheck aria-hidden="true" />
            <AlertTitle>{t("settings:SETTINGS_WORKSPACE_SKILLS_NO_DECLARATIONS_TITLE")}</AlertTitle>
            <AlertDescription>
              {t("settings:SETTINGS_WORKSPACE_SKILLS_NO_DECLARATIONS_DESC")}
            </AlertDescription>
          </Alert>
        )}

        <Alert variant="default">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>{t("settings:SETTINGS_WORKSPACE_SKILLS_INSTALL_BOUNDARY_TITLE")}</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <span>{t("settings:SETTINGS_WORKSPACE_SKILLS_INSTALL_BOUNDARY_DESC")}</span>
            <span className="inline-flex items-center gap-1 text-caption text-label-secondary">
              {t("settings:SETTINGS_WORKSPACE_SKILLS_INSTALL_BOUNDARY_AGENT")}
              <ArrowUpRight className="size-3" aria-hidden="true" />
            </span>
          </AlertDescription>
        </Alert>
      </div>
    </SettingDialog>
  );
}
