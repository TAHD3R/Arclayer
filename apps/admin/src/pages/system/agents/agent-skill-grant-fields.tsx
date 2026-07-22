import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BoxesIcon, ShieldAlertIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { WORKSPACE_SKILLS_QUERY_KEY, listWorkspaceSkillGrantOptions } from "@/api/workspace-skills";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import { Badge } from "@arclayer/ui/badge";
import { Checkbox } from "@arclayer/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSet } from "@arclayer/ui/field";
import { Spinner } from "@arclayer/ui/spinner";
import type { SkillInstallationOut } from "@arclayer/openapi";

type SkillPackageLabel = {
  name: string;
  slug: string;
};

function shortIdentity(value: string): string {
  return value.slice(0, 8);
}

function missingToolGrants(
  installation: SkillInstallationOut,
  supportedToolGrants: readonly string[],
): string[] {
  const supported = new Set(supportedToolGrants);
  return installation.acceptedRequiredTools.filter((toolId) => !supported.has(toolId));
}

export function AgentSkillGrantFields(props: {
  available: boolean | undefined;
  workspaceId: string;
  selectedInstallationIds: readonly string[];
  supportedToolGrants: readonly string[];
  onInvalidSelectionChange: (invalid: boolean) => void;
  onSelectionChange: (installationIds: string[]) => void;
}) {
  const { t } = useTranslation("settings");
  const {
    available,
    onInvalidSelectionChange,
    onSelectionChange,
    selectedInstallationIds,
    supportedToolGrants,
    workspaceId,
  } = props;
  const optionsQuery = useQuery({
    queryKey: [...WORKSPACE_SKILLS_QUERY_KEY, workspaceId, "agent-grant-options"],
    queryFn: ({ signal }) => listWorkspaceSkillGrantOptions(workspaceId, signal),
    enabled: available === true && Boolean(workspaceId),
  });
  const packageLabels = useMemo(() => {
    const labels = new Map<string, SkillPackageLabel>();
    for (const item of optionsQuery.data?.officialPackages ?? []) {
      labels.set(item.packageId, { name: item.displayName, slug: item.slug });
    }
    for (const item of optionsQuery.data?.workspacePackages ?? []) {
      labels.set(item.id, { name: item.displayName, slug: item.slug });
    }
    return labels;
  }, [optionsQuery.data]);
  const installations = optionsQuery.data?.installations ?? [];
  const selected = useMemo(() => new Set(selectedInstallationIds), [selectedInstallationIds]);
  const invalidSelectedCount = installations.filter((installation) => {
    if (!selected.has(installation.id)) return false;
    return (
      installation.status !== "enabled" ||
      missingToolGrants(installation, supportedToolGrants).length > 0
    );
  }).length;
  const selectionUnknown = selectedInstallationIds.some(
    (installationId) => !installations.some((item) => item.id === installationId),
  );

  useEffect(() => {
    onInvalidSelectionChange(
      Boolean(workspaceId) &&
        (available !== true ||
          optionsQuery.isLoading ||
          optionsQuery.isError ||
          invalidSelectedCount > 0 ||
          selectionUnknown),
    );
  }, [
    invalidSelectedCount,
    available,
    onInvalidSelectionChange,
    optionsQuery.isError,
    optionsQuery.isLoading,
    selectionUnknown,
    workspaceId,
  ]);

  if (!workspaceId) {
    return (
      <p className="text-footnote text-label-secondary">
        {t("SETTINGS_SYSTEM_AGENT_SKILL_WORKSPACE_EMPTY")}
      </p>
    );
  }
  if (available === undefined) {
    return (
      <div className="flex items-center gap-2 text-footnote text-label-secondary" role="status">
        <Spinner />
        {t("SETTINGS_SYSTEM_AGENT_SKILL_CAPABILITY_LOADING")}
      </div>
    );
  }
  if (!available) {
    return (
      <Alert variant="destructive">
        <ShieldAlertIcon aria-hidden="true" />
        <AlertTitle>{t("SETTINGS_SYSTEM_AGENT_SKILL_GRANTS_UNAVAILABLE_TITLE")}</AlertTitle>
        <AlertDescription>
          {t("SETTINGS_SYSTEM_AGENT_SKILL_GRANTS_UNAVAILABLE_DESC")}
        </AlertDescription>
      </Alert>
    );
  }
  if (optionsQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 text-footnote text-label-secondary" role="status">
        <Spinner />
        {t("SETTINGS_SYSTEM_AGENT_SKILL_INSTALLATIONS_LOADING")}
      </div>
    );
  }
  if (optionsQuery.isError) {
    return (
      <Alert variant="destructive">
        <ShieldAlertIcon aria-hidden="true" />
        <AlertTitle>{t("SETTINGS_SYSTEM_AGENT_SKILL_INSTALLATIONS_ERROR_TITLE")}</AlertTitle>
        <AlertDescription>
          {t("SETTINGS_SYSTEM_AGENT_SKILL_INSTALLATIONS_ERROR_DESC")}
        </AlertDescription>
      </Alert>
    );
  }
  if (!installations.length) {
    return (
      <Alert>
        <BoxesIcon aria-hidden="true" />
        <AlertTitle>{t("SETTINGS_SYSTEM_AGENT_SKILL_INSTALLATIONS_EMPTY_TITLE")}</AlertTitle>
        <AlertDescription>
          {t("SETTINGS_SYSTEM_AGENT_SKILL_INSTALLATIONS_EMPTY_DESC")}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <FieldSet>
      <FieldGroup className="max-h-64 gap-2 overflow-y-auto rounded-lg border p-2">
        {installations.map((installation) => {
          const checked = selected.has(installation.id);
          const missingTools = missingToolGrants(installation, supportedToolGrants);
          const eligible = installation.status === "enabled" && missingTools.length === 0;
          const label = packageLabels.get(installation.packageId);
          const inputId = `agent-skill-installation-${installation.id}`;
          return (
            <Field
              key={installation.id}
              orientation="horizontal"
              data-disabled={!eligible && !checked ? true : undefined}
              className="items-start rounded-md px-2 py-2.5 hover:bg-accent/50"
            >
              <Checkbox
                id={inputId}
                checked={checked}
                disabled={!eligible && !checked}
                aria-describedby={`${inputId}-description`}
                onCheckedChange={(nextChecked) => {
                  onSelectionChange(
                    nextChecked === true
                      ? [...new Set([...selectedInstallationIds, installation.id])]
                      : selectedInstallationIds.filter((id) => id !== installation.id),
                  );
                }}
              />
              <div className="min-w-0 flex-1">
                <FieldLabel htmlFor={inputId} className="flex w-full items-start justify-between">
                  <span className="min-w-0">
                    <span className="block truncate text-footnote font-semibold text-label-primary">
                      {label?.name ?? t("SETTINGS_SYSTEM_AGENT_SKILL_PACKAGE_UNKNOWN")}
                    </span>
                    <span className="block truncate font-mono text-caption text-label-secondary">
                      {label?.slug ?? shortIdentity(installation.packageId)}
                    </span>
                  </span>
                  <Badge variant="outline">
                    {installation.packageScope === "system"
                      ? t("SETTINGS_SYSTEM_AGENT_SKILL_SCOPE_OFFICIAL")
                      : t("SETTINGS_SYSTEM_AGENT_SKILL_SCOPE_WORKSPACE")}
                  </Badge>
                </FieldLabel>
                <FieldDescription id={`${inputId}-description`} className="mt-1">
                  {missingTools.length
                    ? t("SETTINGS_SYSTEM_AGENT_SKILL_TOOL_MISSING", {
                        tools: missingTools.join(", "),
                      })
                    : installation.status !== "enabled"
                      ? t("SETTINGS_SYSTEM_AGENT_SKILL_INSTALLATION_DISABLED")
                      : t("SETTINGS_SYSTEM_AGENT_SKILL_EXACT_PROVENANCE", {
                          version: shortIdentity(installation.versionId),
                          checksum: shortIdentity(
                            installation.packageChecksum.replace("sha256:", ""),
                          ),
                        })}
                </FieldDescription>
              </div>
            </Field>
          );
        })}
      </FieldGroup>
      {invalidSelectedCount || selectionUnknown ? (
        <p role="alert" className="text-footnote text-destructive">
          {t("SETTINGS_SYSTEM_AGENT_SKILL_SELECTION_INVALID")}
        </p>
      ) : null}
    </FieldSet>
  );
}
