import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowRight,
  BookOpenText,
  Clock3,
  FileText,
  History,
  Plus,
  Search,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  WORKSPACE_KNOWLEDGE_QUERY_KEY,
  createKnowledgeBase,
  createKnowledgeSource,
  createManualKnowledgeSourceVersion,
  getWorkspaceKnowledgeCapabilities,
  listKnowledgeBases,
  listKnowledgeSourceVersions,
  listKnowledgeSources,
} from "@/api/workspace-knowledge";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { notifySuccessText } from "@/lib/notifications";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import { Badge } from "@arclayer/ui/badge";
import { Button } from "@arclayer/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@arclayer/ui/empty";
import { Input } from "@arclayer/ui/input";
import type {
  KnowledgeBaseSummaryOut,
  KnowledgeSourceOut,
  KnowledgeSourceVersionOut,
} from "@arclayer/openapi";

import {
  KnowledgeBaseCreateDialog,
  KnowledgeSourceCreateDialog,
  KnowledgeVersionCreateDialog,
} from "./workspace-knowledge-dialogs";

function statusVariant(status: string) {
  if (status === "ready" || status === "active") return "default" as const;
  if (status === "disabled") return "secondary" as const;
  return "outline" as const;
}

function KnowledgeBaseRow(props: {
  base: KnowledgeBaseSummaryOut;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation("settings");
  return (
    <button
      type="button"
      className={
        "flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors duration-100 last:border-b-0 " +
        (props.selected ? "bg-primary/6" : "hover:bg-accent/60")
      }
      aria-current={props.selected ? "true" : undefined}
      onClick={props.onSelect}
    >
      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border bg-card text-label-secondary">
        <BookOpenText className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-footnote font-semibold text-label-primary">
            {props.base.name}
          </span>
          <Badge variant={statusVariant(props.base.status)}>
            {t(`SETTINGS_WORKSPACE_KNOWLEDGE_STATUS_${props.base.status.toUpperCase()}`)}
          </Badge>
        </span>
        <span className="mt-1 line-clamp-2 text-caption leading-5 text-label-secondary">
          {props.base.description ?? t("SETTINGS_WORKSPACE_KNOWLEDGE_NO_DESCRIPTION")}
        </span>
        <span className="mt-2 block text-caption tabular-nums text-label-secondary">
          {t("SETTINGS_WORKSPACE_KNOWLEDGE_SOURCE_COUNT", { count: props.base.sourceCount })}
        </span>
      </span>
    </button>
  );
}

function RelationshipRail(props: { baseName: string; sourceName?: string; version?: number }) {
  const { t } = useTranslation("settings");
  const stages = [
    {
      icon: BookOpenText,
      label: t("SETTINGS_WORKSPACE_KNOWLEDGE_RELATION_BASE"),
      value: props.baseName,
    },
    {
      icon: FileText,
      label: t("SETTINGS_WORKSPACE_KNOWLEDGE_RELATION_SOURCE"),
      value: props.sourceName ?? t("SETTINGS_WORKSPACE_KNOWLEDGE_RELATION_SOURCE_EMPTY"),
    },
    {
      icon: History,
      label: t("SETTINGS_WORKSPACE_KNOWLEDGE_RELATION_VERSION"),
      value: props.version
        ? t("SETTINGS_WORKSPACE_KNOWLEDGE_VERSION_NUMBER", { version: props.version })
        : t("SETTINGS_WORKSPACE_KNOWLEDGE_RELATION_VERSION_EMPTY"),
    },
  ];
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border bg-card sm:flex-row">
      {stages.map((stage, index) => {
        const Icon = stage.icon;
        return (
          <div key={stage.label} className="contents">
            {index ? (
              <div className="hidden items-center text-label-tertiary sm:flex">
                <ArrowRight className="size-4" aria-hidden="true" />
              </div>
            ) : null}
            <div className="min-w-0 flex-1 px-4 py-3">
              <div className="flex items-center gap-2 text-caption text-label-secondary">
                <Icon className="size-3.5" aria-hidden="true" />
                {stage.label}
              </div>
              <div className="mt-1 truncate text-footnote font-semibold text-label-primary">
                {stage.value}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function VersionList(props: { versions: readonly KnowledgeSourceVersionOut[] }) {
  const { t, i18n } = useTranslation("settings");
  const date = useMemo(
    () => new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, { dateStyle: "medium" }),
    [i18n.language, i18n.resolvedLanguage],
  );
  if (!props.versions.length) {
    return (
      <div className="rounded-lg border border-dashed px-4 py-8 text-center text-footnote text-label-secondary">
        {t("SETTINGS_WORKSPACE_KNOWLEDGE_VERSION_EMPTY")}
      </div>
    );
  }
  return (
    <div className="divide-y rounded-lg border bg-card">
      {props.versions.map((version) => (
        <div key={version.id} className="flex items-center gap-3 px-4 py-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent text-caption font-semibold tabular-nums text-label-primary">
            v{version.versionNumber}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-footnote font-semibold text-label-primary">
                {version.title ?? t("SETTINGS_WORKSPACE_KNOWLEDGE_VERSION_UNTITLED")}
              </span>
              <Badge variant={statusVariant(version.status)}>
                {t(`SETTINGS_WORKSPACE_KNOWLEDGE_STATUS_${version.status.toUpperCase()}`)}
              </Badge>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-caption text-label-secondary">
              <span className="flex items-center gap-1">
                <Clock3 className="size-3" aria-hidden="true" />
                {date.format(new Date(version.createdAt))}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function WorkspaceKnowledgeView({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation(["settings", "common"]);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [selectedBaseId, setSelectedBaseId] = useState<string | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"base" | "source" | "version" | null>(null);

  const capabilitiesQuery = useQuery({
    queryKey: [...WORKSPACE_KNOWLEDGE_QUERY_KEY, workspaceId, "capabilities"],
    queryFn: ({ signal }) => getWorkspaceKnowledgeCapabilities(workspaceId, signal),
  });
  const basesQuery = useQuery({
    queryKey: [...WORKSPACE_KNOWLEDGE_QUERY_KEY, workspaceId, "bases", deferredSearch],
    queryFn: ({ signal }) =>
      listKnowledgeBases(workspaceId, { q: deferredSearch || undefined, limit: 100, signal }),
  });
  const bases = basesQuery.data?.items ?? [];
  const selectedBase = bases.find((base) => base.id === selectedBaseId) ?? bases[0];

  useEffect(() => {
    if (!selectedBase) {
      setSelectedBaseId(null);
      setSelectedSourceId(null);
      return;
    }
    if (selectedBase.id !== selectedBaseId) {
      setSelectedBaseId(selectedBase.id);
      setSelectedSourceId(null);
    }
  }, [selectedBase, selectedBaseId]);

  const sourcesQuery = useQuery({
    queryKey: [...WORKSPACE_KNOWLEDGE_QUERY_KEY, workspaceId, "sources", selectedBase?.id],
    queryFn: ({ signal }) =>
      listKnowledgeSources(workspaceId, selectedBase!.id, { limit: 100, signal }),
    enabled: Boolean(selectedBase),
  });
  const sources = sourcesQuery.data?.items ?? [];
  const selectedSource = sources.find((source) => source.id === selectedSourceId) ?? sources[0];

  useEffect(() => {
    if (!selectedSource) {
      setSelectedSourceId(null);
      return;
    }
    if (selectedSource.id !== selectedSourceId) setSelectedSourceId(selectedSource.id);
  }, [selectedSource, selectedSourceId]);

  const versionsQuery = useQuery({
    queryKey: [
      ...WORKSPACE_KNOWLEDGE_QUERY_KEY,
      workspaceId,
      "versions",
      selectedBase?.id,
      selectedSource?.id,
    ],
    queryFn: ({ signal }) =>
      listKnowledgeSourceVersions(workspaceId, selectedBase!.id, selectedSource!.id, {
        limit: 100,
        signal,
      }),
    enabled: Boolean(selectedBase && selectedSource),
  });
  const versions = versionsQuery.data?.items ?? [];
  const manualAuthoringAvailable =
    capabilitiesQuery.data?.manualSourcesAvailable === true && !capabilitiesQuery.isError;

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: WORKSPACE_KNOWLEDGE_QUERY_KEY });
  const createBaseMutation = useMutation({
    mutationFn: (values: { name: string; description: string; locale: string }) =>
      createKnowledgeBase(
        workspaceId,
        {
          name: values.name,
          description: values.description || null,
          defaultLocale: values.locale,
          accessPolicy: { visibility: "workspace" },
        },
        crypto.randomUUID(),
      ),
    onSuccess: async (base) => {
      setSelectedBaseId(base.id);
      await invalidate();
      notifySuccessText(t("settings:SETTINGS_WORKSPACE_KNOWLEDGE_CREATED"));
    },
  });
  const createSourceMutation = useMutation({
    mutationFn: (values: { displayName: string; documentKey: string; locale: string }) =>
      createKnowledgeSource(
        workspaceId,
        selectedBase!.id,
        {
          displayName: values.displayName,
          locale: values.locale,
          locator: {
            kind: "manual",
            documentKey: values.documentKey || null,
          },
        },
        crypto.randomUUID(),
      ),
    onSuccess: async (source) => {
      setSelectedSourceId(source.id);
      await invalidate();
      notifySuccessText(t("settings:SETTINGS_WORKSPACE_KNOWLEDGE_SOURCE_CREATED"));
    },
  });
  const createVersionMutation = useMutation({
    mutationFn: (values: { title: string; content: string }) =>
      createManualKnowledgeSourceVersion(
        workspaceId,
        selectedBase!.id,
        selectedSource!.id,
        { title: values.title || null, content: values.content, documentMetadata: {} },
        crypto.randomUUID(),
      ),
    onSuccess: async () => {
      await invalidate();
      notifySuccessText(t("settings:SETTINGS_WORKSPACE_KNOWLEDGE_VERSION_CREATED"));
    },
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-label-tertiary"
            aria-hidden="true"
          />
          <Input
            className="pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label={t("settings:SETTINGS_WORKSPACE_KNOWLEDGE_SEARCH_LABEL")}
            placeholder={t("settings:SETTINGS_WORKSPACE_KNOWLEDGE_SEARCH_PLACEHOLDER")}
          />
        </div>
        {bases.length ? (
          <Button disabled={!manualAuthoringAvailable} onClick={() => setDialog("base")}>
            <Plus data-icon="inline-start" />
            {t("settings:SETTINGS_WORKSPACE_KNOWLEDGE_CREATE_ACTION")}
          </Button>
        ) : null}
      </div>

      {capabilitiesQuery.isError ? (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>
            {t("settings:SETTINGS_WORKSPACE_KNOWLEDGE_CREATE_UNAVAILABLE_TITLE")}
          </AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{t("settings:SETTINGS_WORKSPACE_KNOWLEDGE_CREATE_UNAVAILABLE_DESC")}</span>
            <Button size="sm" variant="outline" onClick={() => void capabilitiesQuery.refetch()}>
              {t("common:RETRY")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <ContentGuard
        loading={basesQuery.isLoading}
        error={basesQuery.error}
        onRetry={() => void basesQuery.refetch()}
        loadingVariant="form"
      >
        {!bases.length ? (
          <Empty className="min-h-[14rem] border bg-card">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BookOpenText aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>{t("settings:SETTINGS_WORKSPACE_KNOWLEDGE_EMPTY_TITLE")}</EmptyTitle>
              <EmptyDescription>
                {t("settings:SETTINGS_WORKSPACE_KNOWLEDGE_EMPTY_DESC")}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button disabled={!manualAuthoringAvailable} onClick={() => setDialog("base")}>
                <Plus data-icon="inline-start" />
                {t("settings:SETTINGS_WORKSPACE_KNOWLEDGE_CREATE_ACTION")}
              </Button>
            </EmptyContent>
          </Empty>
        ) : selectedBase ? (
          <div className="grid min-h-[36rem] overflow-hidden rounded-xl border bg-card lg:grid-cols-[19rem_minmax(0,1fr)]">
            <aside
              className="border-b bg-muted/30 lg:border-b-0 lg:border-r"
              aria-label={t("settings:SETTINGS_WORKSPACE_KNOWLEDGE_BASE_LIST_LABEL")}
            >
              {bases.map((base) => (
                <KnowledgeBaseRow
                  key={base.id}
                  base={base}
                  selected={base.id === selectedBase.id}
                  onSelect={() => setSelectedBaseId(base.id)}
                />
              ))}
            </aside>
            <section className="min-w-0 p-4 sm:p-5" aria-labelledby="knowledge-base-detail-title">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2
                    id="knowledge-base-detail-title"
                    className="text-title3 font-semibold text-label-primary"
                  >
                    {selectedBase.name}
                  </h2>
                  <p className="mt-1 text-footnote text-label-secondary">
                    {selectedBase.description ??
                      t("settings:SETTINGS_WORKSPACE_KNOWLEDGE_NO_DESCRIPTION")}
                  </p>
                </div>
                <Button
                  variant="outline"
                  disabled={!manualAuthoringAvailable}
                  onClick={() => setDialog("source")}
                >
                  <Plus data-icon="inline-start" />
                  {t("settings:SETTINGS_WORKSPACE_KNOWLEDGE_SOURCE_CREATE_ACTION")}
                </Button>
              </div>

              <div className="mt-5">
                <RelationshipRail
                  baseName={selectedBase.name}
                  sourceName={selectedSource?.displayName}
                  version={versions[0]?.versionNumber}
                />
              </div>

              <ContentGuard
                loading={sourcesQuery.isLoading}
                error={sourcesQuery.error}
                onRetry={() => void sourcesQuery.refetch()}
                loadingVariant="form"
              >
                <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(14rem,0.7fr)_minmax(20rem,1.3fr)]">
                  <div>
                    <h3 className="text-headline text-label-primary">
                      {t("settings:SETTINGS_WORKSPACE_KNOWLEDGE_SOURCES_TITLE")}
                    </h3>
                    <div className="mt-3 divide-y rounded-lg border">
                      {sources.length ? (
                        sources.map((source: KnowledgeSourceOut) => (
                          <button
                            key={source.id}
                            type="button"
                            className={
                              "flex w-full items-center gap-3 px-3 py-3 text-left transition-colors duration-100 " +
                              (source.id === selectedSource?.id
                                ? "bg-primary/6"
                                : "hover:bg-accent/60")
                            }
                            onClick={() => setSelectedSourceId(source.id)}
                          >
                            <FileText
                              className="size-4 shrink-0 text-label-secondary"
                              aria-hidden="true"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-footnote font-semibold text-label-primary">
                                {source.displayName}
                              </span>
                              <span className="mt-0.5 block text-caption text-label-secondary">
                                {source.locale}
                              </span>
                            </span>
                            <Badge variant={statusVariant(source.status)}>
                              {t(
                                `settings:SETTINGS_WORKSPACE_KNOWLEDGE_STATUS_${source.status.toUpperCase()}`,
                              )}
                            </Badge>
                          </button>
                        ))
                      ) : (
                        <div className="px-4 py-8 text-center text-footnote text-label-secondary">
                          {t("settings:SETTINGS_WORKSPACE_KNOWLEDGE_SOURCE_EMPTY")}
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-headline text-label-primary">
                        {t("settings:SETTINGS_WORKSPACE_KNOWLEDGE_VERSIONS_TITLE")}
                      </h3>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!selectedSource || !manualAuthoringAvailable}
                        onClick={() => setDialog("version")}
                      >
                        <Plus data-icon="inline-start" />
                        {t("settings:SETTINGS_WORKSPACE_KNOWLEDGE_VERSION_CREATE_ACTION")}
                      </Button>
                    </div>
                    <ContentGuard
                      loading={versionsQuery.isLoading}
                      error={versionsQuery.error}
                      onRetry={() => void versionsQuery.refetch()}
                      loadingVariant="form"
                    >
                      <div className="mt-3">
                        <VersionList versions={versions} />
                      </div>
                    </ContentGuard>
                  </div>
                </div>
              </ContentGuard>
            </section>
          </div>
        ) : null}
      </ContentGuard>

      <KnowledgeBaseCreateDialog
        open={dialog === "base"}
        onOpenChange={(open) => setDialog(open ? "base" : null)}
        pending={createBaseMutation.isPending}
        onSubmit={(values) => createBaseMutation.mutateAsync(values).then(() => undefined)}
      />
      <KnowledgeSourceCreateDialog
        open={dialog === "source"}
        onOpenChange={(open) => setDialog(open ? "source" : null)}
        pending={createSourceMutation.isPending}
        onSubmit={(values) => createSourceMutation.mutateAsync(values).then(() => undefined)}
      />
      <KnowledgeVersionCreateDialog
        open={dialog === "version"}
        onOpenChange={(open) => setDialog(open ? "version" : null)}
        pending={createVersionMutation.isPending}
        onSubmit={(values) => createVersionMutation.mutateAsync(values).then(() => undefined)}
      />
    </div>
  );
}
