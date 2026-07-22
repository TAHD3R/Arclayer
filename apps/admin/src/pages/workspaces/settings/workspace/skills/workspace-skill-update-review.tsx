import { CircleAlert, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { SkillUpdatePreviewOut } from "@arclayer/openapi";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import { Badge } from "@arclayer/ui/badge";
import { Button } from "@arclayer/ui/button";
import { Checkbox } from "@arclayer/ui/checkbox";
import { Separator } from "@arclayer/ui/separator";

export type WorkspaceSkillDeclarationReview = Readonly<{
  kind: "tool" | "permission" | "egress";
  identity: string;
  purpose: string;
  detail?: string;
}>;

export function UpdatePreviewLoading() {
  const { t } = useTranslation("settings");
  return (
    <div className="grid gap-3" aria-live="polite">
      <div className="h-20 animate-pulse rounded-lg bg-muted" />
      <p className="text-footnote text-label-secondary">
        {t("SETTINGS_WORKSPACE_SKILLS_UPDATE_LOADING")}
      </p>
    </div>
  );
}

export function UpdateReviewError(props: {
  message: string;
  retrying: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation(["settings", "common"]);
  return (
    <Alert variant="destructive">
      <CircleAlert aria-hidden="true" />
      <AlertTitle>{t("settings:SETTINGS_WORKSPACE_SKILLS_UPDATE_ERROR_TITLE")}</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <span>{props.message}</span>
        <Button
          size="sm"
          variant="outline"
          className="self-start"
          loading={props.retrying}
          onClick={props.onRetry}
        >
          {t("common:RETRY")}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export function ExactVersionComparison({ preview }: { preview: SkillUpdatePreviewOut }) {
  const { t } = useTranslation("settings");
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {(["current", "candidate"] as const).map((kind) => {
        const target = preview[kind];
        return (
          <section key={kind} className="min-w-0 rounded-lg border bg-muted/20 p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-footnote font-semibold text-label-primary">
                {t(`SETTINGS_WORKSPACE_SKILLS_UPDATE_${kind.toUpperCase()}_LABEL`)}
              </h3>
              <Badge variant="outline" className="font-mono tabular-nums">
                v{target.versionNumber}
                {target.semanticVersion ? ` · ${target.semanticVersion}` : ""}
              </Badge>
            </div>
            <code className="mt-3 block break-all text-caption text-label-secondary">
              {target.packageChecksum}
            </code>
            <p className="mt-2 text-caption text-label-tertiary">
              {t("SETTINGS_WORKSPACE_SKILLS_UPDATE_VALIDATION_LABEL", {
                status: target.validationStatus,
              })}
            </p>
          </section>
        );
      })}
    </div>
  );
}

export function UpdateRiskSummary({ preview }: { preview: SkillUpdatePreviewOut }) {
  const { t } = useTranslation("settings");
  return (
    <Alert variant={preview.risk === "incompatible" ? "destructive" : "default"}>
      <CircleAlert aria-hidden="true" />
      <AlertTitle>{t("SETTINGS_WORKSPACE_SKILLS_UPDATE_RISK_TITLE")}</AlertTitle>
      <AlertDescription>
        <div className="mt-1 flex flex-wrap gap-2">
          {preview.riskCategories.map((risk) => (
            <Badge key={risk} variant={risk === "incompatible" ? "destructive" : "secondary"}>
              {t(`SETTINGS_WORKSPACE_SKILLS_UPDATE_RISK_${risk.toUpperCase()}`)}
            </Badge>
          ))}
        </div>
        <p className="mt-3">
          {t(
            preview.risk === "incompatible"
              ? "SETTINGS_WORKSPACE_SKILLS_UPDATE_INCOMPATIBLE_DESC"
              : "SETTINGS_WORKSPACE_SKILLS_UPDATE_RISK_DESC",
          )}
        </p>
      </AlertDescription>
    </Alert>
  );
}

export function UpdateDiffReview({ preview }: { preview: SkillUpdatePreviewOut }) {
  const { t } = useTranslation("settings");
  const diff = preview.diff;
  const declarations = [
    ...(diff.requiredToolChanges ?? []).map((item) => `${item.changeType}: ${item.toolId}`),
    ...(diff.permissionChanges ?? []).map((item) => `${item.changeType}: ${item.action}`),
    ...(diff.dataEgressChanges ?? []).map((item) => `${item.changeType}: ${item.destination}`),
  ];
  const contractChanges = [
    ...(diff.instructionsChanged
      ? [t("SETTINGS_WORKSPACE_SKILLS_UPDATE_INSTRUCTIONS_CHANGED")]
      : []),
    ...(diff.compatibilityChanged
      ? [t("SETTINGS_WORKSPACE_SKILLS_UPDATE_COMPATIBILITY_CHANGED")]
      : []),
    ...(diff.sourceProvenanceChanged
      ? [t("SETTINGS_WORKSPACE_SKILLS_UPDATE_PROVENANCE_CHANGED")]
      : []),
    ...(diff.validationFindingsChanged
      ? [t("SETTINGS_WORKSPACE_SKILLS_UPDATE_VALIDATION_CHANGED")]
      : []),
    ...(diff.capabilityTagsAdded ?? []).map((item) => `+ ${item}`),
    ...(diff.capabilityTagsRemoved ?? []).map((item) => `− ${item}`),
  ];
  return (
    <section aria-labelledby="workspace-skill-update-diff-title">
      <h3 id="workspace-skill-update-diff-title" className="text-headline text-label-primary">
        {t("SETTINGS_WORKSPACE_SKILLS_UPDATE_DIFF_TITLE")}
      </h3>
      <p className="mt-1 text-footnote text-label-secondary">
        {t("SETTINGS_WORKSPACE_SKILLS_UPDATE_DIFF_DESC")}
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <ChangeGroup
          title={t("SETTINGS_WORKSPACE_SKILLS_UPDATE_RESOURCES_LABEL")}
          items={(diff.resourceChanges ?? []).map((item) => `${item.changeType}: ${item.path}`)}
        />
        <ChangeGroup
          title={t("SETTINGS_WORKSPACE_SKILLS_UPDATE_DECLARATIONS_LABEL")}
          items={declarations}
        />
        <ChangeGroup
          title={t("SETTINGS_WORKSPACE_SKILLS_UPDATE_CONTRACT_LABEL")}
          items={contractChanges}
        />
        <ChangeGroup
          title={t("SETTINGS_WORKSPACE_SKILLS_UPDATE_FINDINGS_LABEL")}
          items={(diff.candidateValidationFindings ?? []).map(
            (item) => `${item.severity}: ${item.code} — ${item.message}`,
          )}
        />
      </div>
    </section>
  );
}

function ChangeGroup({ title, items }: { title: string; items: string[] }) {
  const { t } = useTranslation("settings");
  return (
    <div className="min-w-0 rounded-lg border p-3">
      <h4 className="text-footnote font-semibold text-label-primary">{title}</h4>
      {items.length ? (
        <ul className="mt-2 space-y-1 text-caption text-label-secondary">
          {items.map((item) => (
            <li key={item} className="break-words font-mono">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-caption text-label-tertiary">
          {t("SETTINGS_WORKSPACE_SKILLS_UPDATE_NO_CHANGES")}
        </p>
      )}
    </div>
  );
}

export function DeclarationAcceptance(props: {
  declarations: WorkspaceSkillDeclarationReview[];
  accepted: ReadonlySet<string>;
  keyFor: (item: WorkspaceSkillDeclarationReview) => string;
  onToggle: (item: WorkspaceSkillDeclarationReview, checked: boolean) => void;
}) {
  const { t } = useTranslation("settings");
  if (!props.declarations.length) {
    return (
      <Alert>
        <ShieldCheck aria-hidden="true" />
        <AlertTitle>{t("SETTINGS_WORKSPACE_SKILLS_UPDATE_NO_ACCEPTANCE_TITLE")}</AlertTitle>
        <AlertDescription>
          {t("SETTINGS_WORKSPACE_SKILLS_UPDATE_NO_ACCEPTANCE_DESC")}
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-headline text-label-primary">
        {t("SETTINGS_WORKSPACE_SKILLS_UPDATE_ACCEPTANCE_TITLE")}
      </legend>
      <p className="text-footnote text-label-secondary">
        {t("SETTINGS_WORKSPACE_SKILLS_UPDATE_ACCEPTANCE_DESC")}
      </p>
      <Separator />
      {props.declarations.map((item) => {
        const key = props.keyFor(item);
        return (
          <label key={key} className="flex min-h-11 items-start gap-3 rounded-lg border p-3">
            <Checkbox
              className="mt-0.5"
              checked={props.accepted.has(key)}
              onCheckedChange={(checked) => props.onToggle(item, checked === true)}
            />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-footnote font-semibold text-label-primary">
                  {item.identity}
                </span>
                <Badge variant="secondary">
                  {t(`SETTINGS_WORKSPACE_SKILLS_DECLARATION_${item.kind.toUpperCase()}`)}
                </Badge>
              </span>
              <span className="mt-1 block text-footnote text-label-secondary">{item.purpose}</span>
              {item.detail ? (
                <span className="mt-1 block font-mono text-caption text-label-tertiary">
                  {item.detail}
                </span>
              ) : null}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
