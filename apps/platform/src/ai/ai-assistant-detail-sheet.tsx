import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { SystemAgentDefinitionSummaryOut } from "@arclayer/platform-openapi";

import { listAiAssistantAssignments, listAiAssistantVersions } from "@/ai/ai-assistants-api";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useMonitoringQuery } from "@/monitoring/monitoring-ui";

export function AiAssistantDetailSheet(props: {
  assistant: SystemAgentDefinitionSummaryOut;
  onClose: () => void;
}) {
  const { t } = useTranslation("ai");
  const assistant = props.assistant;
  const versionsLoad = useCallback(() => listAiAssistantVersions(assistant.id), [assistant.id]);
  const assignmentsLoad = useCallback(
    () => listAiAssistantAssignments(assistant.id),
    [assistant.id],
  );
  const versions = useMonitoringQuery(versionsLoad, [assistant.id]);
  const assignments = useMonitoringQuery(assignmentsLoad, [assistant.id]);

  return (
    <Sheet onOpenChange={(open) => !open && props.onClose()} open>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{assistant.displayName}</SheetTitle>
          <SheetDescription>{t("ASSISTANT_DETAIL_DESCRIPTION")}</SheetDescription>
        </SheetHeader>
        <div className="grid gap-6 px-6 pb-8">
          <section className="grid gap-2" aria-labelledby="assistant-versions-heading">
            <h3 className="text-base font-semibold" id="assistant-versions-heading">
              {t("ASSISTANT_VERSIONS")}
            </h3>
            {versions.state.status === "loading" ? (
              <Skeleton className="h-24 w-full" />
            ) : versions.state.status === "error" ? (
              <p className="text-sm text-muted-foreground">{t("ASSISTANT_DETAIL_ERROR")}</p>
            ) : (versions.state.data.items ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("ASSISTANT_NO_VERSION")}</p>
            ) : (
              <ul className="divide-y rounded-lg border bg-card">
                {(versions.state.data.items ?? []).map((version) => (
                  <li
                    className="flex flex-wrap items-center justify-between gap-2 p-3"
                    key={version.id}
                  >
                    <div className="min-w-0">
                      <p className="font-medium">
                        {t("ASSISTANT_VERSION_NUMBER", { number: version.versionNumber })}
                      </p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {version.contentChecksum.slice(0, 12)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={version.state === "published" ? "secondary" : "outline"}>
                        {t(`VERSION_STATE_${version.state.toUpperCase()}`)}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="grid gap-2" aria-labelledby="assistant-assignments-heading">
            <h3 className="text-base font-semibold" id="assistant-assignments-heading">
              {t("ASSISTANT_ASSIGNMENTS")}
            </h3>
            {assignments.state.status === "loading" ? (
              <Skeleton className="h-24 w-full" />
            ) : assignments.state.status === "error" ? (
              <p className="text-sm text-muted-foreground">{t("ASSISTANT_DETAIL_ERROR")}</p>
            ) : (assignments.state.data.items ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("ASSISTANT_NO_ASSIGNMENTS")}</p>
            ) : (
              <ul className="divide-y rounded-lg border bg-card">
                {(assignments.state.data.items ?? []).map((assignment) => (
                  <li
                    className="flex flex-wrap items-center justify-between gap-2 p-3"
                    key={assignment.id}
                  >
                    <div className="min-w-0">
                      <p className="font-medium">
                        {assignment.workspaceName}
                        {assignment.projectName ? ` · ${assignment.projectName}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("ASSISTANT_ASSIGNMENT_VERSION", {
                          number: assignment.versionNumber,
                        })}
                        {assignment.isDefault ? ` · ${t("ASSISTANT_ASSIGNMENT_DEFAULT")}` : ""}
                      </p>
                    </div>
                    <Badge variant={assignment.enabled ? "secondary" : "outline"}>
                      {t(
                        assignment.enabled
                          ? "ASSISTANT_ASSIGNMENT_ENABLED"
                          : "ASSISTANT_ASSIGNMENT_DISABLED",
                      )}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
