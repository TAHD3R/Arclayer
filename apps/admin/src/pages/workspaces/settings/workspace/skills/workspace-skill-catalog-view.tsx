import { CheckCircle2, FileArchive, Github, PencilRuler } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { SkillInstallationOut, SkillPackageSummaryOut } from "@arclayer/openapi";

import { cn } from "@arclayer/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@arclayer/ui/table";

export function WorkspaceSkillCatalogView({
  packages,
  installations,
  selectedId,
  onSelect,
}: Readonly<{
  packages: readonly SkillPackageSummaryOut[];
  installations: readonly SkillInstallationOut[];
  selectedId?: string;
  onSelect: (packageId: string) => void;
}>) {
  const { t } = useTranslation("settings");
  const installationByPackage = useMemo(
    () => new Map(installations.map((installation) => [installation.packageId, installation])),
    [installations],
  );
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("SETTINGS_WORKSPACE_SKILLS_COLUMN_NAME")}</TableHead>
          <TableHead>{t("SETTINGS_WORKSPACE_SKILLS_COLUMN_SOURCE")}</TableHead>
          <TableHead>{t("SETTINGS_WORKSPACE_SKILLS_COLUMN_VERSIONS")}</TableHead>
          <TableHead>{t("SETTINGS_WORKSPACE_SKILLS_COLUMN_INSTALLATION")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {packages.map((skillPackage) => (
          <SkillRow
            installation={installationByPackage.get(skillPackage.id)}
            key={skillPackage.id}
            onSelect={() => onSelect(skillPackage.id)}
            selected={skillPackage.id === selectedId}
            skillPackage={skillPackage}
          />
        ))}
      </TableBody>
    </Table>
  );
}

function SkillRow(props: {
  skillPackage: SkillPackageSummaryOut;
  installation?: SkillInstallationOut;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation("settings");
  const source = getSkillSource(props.skillPackage.sourceKind);
  return (
    <TableRow
      aria-selected={props.selected}
      className={cn("cursor-pointer", props.selected && "bg-primary/5")}
      onClick={props.onSelect}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        props.onSelect();
      }}
      tabIndex={0}
    >
      <TableCell>
        <div className="font-semibold text-label-primary">{props.skillPackage.displayName}</div>
        <div className="mt-1 line-clamp-1 max-w-xl text-caption text-label-secondary">
          {props.skillPackage.description}
        </div>
      </TableCell>
      <TableCell>
        {t(source.labelKey)}
      </TableCell>
      <TableCell className="tabular-nums">{props.skillPackage.versionCount}</TableCell>
      <TableCell>
        {props.installation ? (
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
            {t(
              props.installation.status === "enabled"
                ? "SETTINGS_WORKSPACE_SKILLS_ENABLED_BADGE"
                : "SETTINGS_WORKSPACE_SKILLS_DISABLED_BADGE",
            )}
          </span>
        ) : (
          <span className="text-label-tertiary">
            {t("SETTINGS_WORKSPACE_SKILLS_NOT_INSTALLED")}
          </span>
        )}
      </TableCell>
    </TableRow>
  );
}

function getSkillSource(sourceKind: string) {
  if (sourceKind === "github") {
    return { icon: Github, labelKey: "SETTINGS_WORKSPACE_SKILLS_SOURCE_GITHUB" } as const;
  }
  if (sourceKind === "archive") {
    return { icon: FileArchive, labelKey: "SETTINGS_WORKSPACE_SKILLS_SOURCE_ARCHIVE" } as const;
  }
  return { icon: PencilRuler, labelKey: "SETTINGS_WORKSPACE_SKILLS_SOURCE_MANUAL" } as const;
}
