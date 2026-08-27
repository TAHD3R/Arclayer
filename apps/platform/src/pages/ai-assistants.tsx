import { Pencil, Plus } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type {
  SystemAgentCatalogCapabilitiesOut,
  SystemAgentDefinitionSummaryOut,
} from "@arclayer/platform-openapi";

import { AiAssistantDetailSheet } from "@/ai/ai-assistant-detail-sheet";
import { AiAssistantEditorDialog, AiAssistantVersionDialog } from "@/ai/ai-assistant-dialogs";
import {
  getAiAssistantCapabilities,
  listAiAssistants,
  retireAiAssistantVersion,
  updateAiAssistant,
} from "@/ai/ai-assistants-api";
import { AiPage, AiState } from "@/ai/ai-page-state";
import { useMonitoringQuery } from "@/monitoring/monitoring-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

export function AiAssistantsPage() {
  const { t } = useTranslation("ai");
  const load = useCallback(
    async () => ({
      capabilities: await getAiAssistantCapabilities(),
      catalog: await listAiAssistants({ scope: "system", page: 1, size: 100 }),
    }),
    [],
  );
  const { state, retry } = useMonitoringQuery(load, []);
  const [pending, setPending] = useState<string | null>(null);
  const [editor, setEditor] = useState<"create" | SystemAgentDefinitionSummaryOut | null>(null);
  const [versionEditor, setVersionEditor] = useState<SystemAgentDefinitionSummaryOut | null>(null);
  const [detailTarget, setDetailTarget] = useState<SystemAgentDefinitionSummaryOut | null>(null);
  const changeLifecycle = async (
    assistant: SystemAgentDefinitionSummaryOut,
    lifecycleState: "active" | "disabled" | "archived",
  ) => {
    setPending(`assistant:${assistant.id}`);
    try {
      await updateAiAssistant(assistant.id, { lifecycleState });
      toast.success(t("ASSISTANT_UPDATED"));
      retry();
    } catch (cause) {
      toast.error(t("ACTION_FAILED"), {
        description: cause instanceof Error ? cause.message : t("ACTION_FAILED"),
      });
    } finally {
      setPending(null);
    }
  };
  const changeVersionState = async (
    assistant: SystemAgentDefinitionSummaryOut,
    state: "published" | "retired",
  ) => {
    const version = assistant.latestVersion;
    if (!version) return;
    setPending(`version:${version.id}`);
    try {
      await retireAiAssistantVersion(assistant.id, version.id, { state });
      toast.success(
        t(state === "published" ? "ASSISTANT_VERSION_PUBLISHED" : "ASSISTANT_VERSION_RETIRED"),
      );
      retry();
    } catch (cause) {
      toast.error(t("ACTION_FAILED"), {
        description: cause instanceof Error ? cause.message : t("ACTION_FAILED"),
      });
    } finally {
      setPending(null);
    }
  };
  return (
    <AiPage description={t("ASSISTANTS_DESCRIPTION")} title={t("ASSISTANTS_TITLE")}>
      <AiState empty={() => false} retry={retry} state={state}>
        {(data) => {
          const approvalProfiles = assistantApprovalProfiles(data.capabilities);
          const publicationAvailable = assistantCapabilityFlag(
            data.capabilities,
            "runtimeValidationPortAvailable",
          );
          return (
            <>
              <div className="flex justify-end">
                <Button disabled={!approvalProfiles.length} onClick={() => setEditor("create")}>
                  <Plus aria-hidden="true" />
                  {t("CREATE_ASSISTANT")}
                </Button>
              </div>
              {!publicationAvailable ? (
                <Card>
                  <CardHeader>
                    <CardTitle>{t("ASSISTANT_PUBLICATION_UNAVAILABLE_TITLE")}</CardTitle>
                    <CardDescription>
                      {t("ASSISTANT_PUBLICATION_UNAVAILABLE_DESCRIPTION")}
                    </CardDescription>
                  </CardHeader>
                </Card>
              ) : null}
              {data.catalog.items?.length ? (
                <Card>
                  <CardContent className="px-0">
                    <ul>
                      {data.catalog.items.map((assistant) => (
                        <li
                          className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4"
                          key={assistant.id}
                        >
                          <div>
                            <p className="font-medium">{assistant.displayName}</p>
                            <p className="text-sm text-muted-foreground">{assistant.description}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {assistant.latestVersion
                                ? t("ASSISTANT_LATEST_VERSION", {
                                    number: assistant.latestVersion.versionNumber,
                                    state: t(
                                      `VERSION_STATE_${assistant.latestVersion.state.toUpperCase()}`,
                                    ),
                                  })
                                : t("ASSISTANT_NO_VERSION")}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <Badge variant={assistant.isOfficial ? "secondary" : "outline"}>
                              {t(`ASSISTANT_STATE_${assistant.lifecycleState.toUpperCase()}`)}
                            </Badge>
                            <Button
                              onClick={() => setDetailTarget(assistant)}
                              size="sm"
                              variant="ghost"
                            >
                              {t("ASSISTANT_DETAILS")}
                            </Button>
                            {assistant.isOfficial ? (
                              <span className="text-xs text-muted-foreground">
                                {t("OFFICIAL_ASSISTANT_MANAGED")}
                              </span>
                            ) : assistant.lifecycleState === "archived" ? (
                              <>
                                <span className="text-xs text-muted-foreground">
                                  {t("ARCHIVED_ASSISTANT_READ_ONLY")}
                                </span>
                                <Button
                                  disabled={pending === `assistant:${assistant.id}`}
                                  onClick={() => void changeLifecycle(assistant, "active")}
                                  size="sm"
                                  variant="outline"
                                >
                                  {t("RESTORE")}
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  onClick={() => setEditor(assistant)}
                                  size="sm"
                                  variant="ghost"
                                >
                                  <Pencil aria-hidden="true" />
                                  {t("EDIT_ASSISTANT")}
                                </Button>
                                <Button
                                  disabled={!approvalProfiles.length}
                                  onClick={() => setVersionEditor(assistant)}
                                  size="sm"
                                  variant="outline"
                                >
                                  {t("CREATE_VERSION")}
                                </Button>
                                {publicationAvailable &&
                                assistant.latestVersion?.state === "draft" ? (
                                  <Button
                                    disabled={pending === `version:${assistant.latestVersion.id}`}
                                    onClick={() => void changeVersionState(assistant, "published")}
                                    size="sm"
                                  >
                                    {t("PUBLISH")}
                                  </Button>
                                ) : null}
                                {assistant.latestVersion?.state === "published" ? (
                                  <Button
                                    disabled={pending === `version:${assistant.latestVersion.id}`}
                                    onClick={() => void changeVersionState(assistant, "retired")}
                                    size="sm"
                                    variant="outline"
                                  >
                                    {t("RETIRE")}
                                  </Button>
                                ) : null}
                                <Button
                                  disabled={
                                    pending === `assistant:${assistant.id}` ||
                                    assistant.lifecycleState === "active"
                                  }
                                  onClick={() => void changeLifecycle(assistant, "active")}
                                  size="sm"
                                  variant="outline"
                                >
                                  {t("ENABLE")}
                                </Button>
                                <Button
                                  disabled={
                                    pending === `assistant:${assistant.id}` ||
                                    assistant.lifecycleState === "disabled"
                                  }
                                  onClick={() => void changeLifecycle(assistant, "disabled")}
                                  size="sm"
                                  variant="outline"
                                >
                                  {t("DISABLE")}
                                </Button>
                                <Button
                                  disabled={pending === `assistant:${assistant.id}`}
                                  onClick={() => void changeLifecycle(assistant, "archived")}
                                  size="sm"
                                  variant="ghost"
                                >
                                  {t("ARCHIVE")}
                                </Button>
                              </>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ) : (
                <Empty className="min-h-72 border bg-card">
                  <EmptyHeader>
                    <EmptyTitle>{t("ASSISTANT_CATALOG_EMPTY_TITLE")}</EmptyTitle>
                    <EmptyDescription>{t("ASSISTANT_CATALOG_EMPTY_DESCRIPTION")}</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
              {editor ? (
                <AiAssistantEditorDialog
                  approvalProfiles={approvalProfiles}
                  approvalProfileCatalog={data.capabilities.approvalProfileCatalog ?? []}
                  assistant={editor === "create" ? undefined : editor}
                  onCompleted={() => {
                    toast.success(
                      t(editor === "create" ? "ASSISTANT_CREATED" : "ASSISTANT_UPDATED"),
                    );
                    retry();
                  }}
                  onOpenChange={(open) => !open && setEditor(null)}
                  open
                  supportedToolGrants={data.capabilities.supportedToolGrants}
                  toolGrantCatalog={data.capabilities.toolGrantCatalog ?? []}
                />
              ) : null}
              {versionEditor ? (
                <AiAssistantVersionDialog
                  approvalProfiles={approvalProfiles}
                  approvalProfileCatalog={data.capabilities.approvalProfileCatalog ?? []}
                  assistant={versionEditor}
                  onCompleted={() => {
                    toast.success(t("ASSISTANT_VERSION_CREATED"));
                    retry();
                  }}
                  onOpenChange={(open) => !open && setVersionEditor(null)}
                  open
                  supportedToolGrants={data.capabilities.supportedToolGrants}
                  toolGrantCatalog={data.capabilities.toolGrantCatalog ?? []}
                />
              ) : null}
              {detailTarget ? (
                <AiAssistantDetailSheet
                  assistant={detailTarget}
                  onClose={() => setDetailTarget(null)}
                />
              ) : null}
            </>
          );
        }}
      </AiState>
    </AiPage>
  );
}

function assistantApprovalProfiles(capabilities: SystemAgentCatalogCapabilitiesOut): string[] {
  const value = capabilities.constraints?.customApprovalProfiles;
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function assistantCapabilityFlag(
  capabilities: SystemAgentCatalogCapabilitiesOut,
  key: string,
): boolean {
  return capabilities.constraints?.[key] === true;
}
