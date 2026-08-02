import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, BookOpenText, Clock3, FileText, Plus, RefreshCw, Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import type {
  KnowledgeBaseSummaryOut,
  KnowledgeSourceOut,
  KnowledgeSourceVersionOut,
} from "@arclayer/openapi";
import {
  WORKSPACE_KNOWLEDGE_QUERY_KEY,
  createKnowledgeBase,
  createKnowledgeSource,
  createKnowledgeSourceIngestion,
  createManualKnowledgeSourceVersion,
  getWorkspaceKnowledgeCapabilities,
  listKnowledgeBases,
  listKnowledgeSources,
  listKnowledgeSourceVersions,
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

import {
  ReferenceBaseCreateDialog,
  ReferenceSourceCreateDialog,
  ReferenceVersionCreateDialog,
  type ReferenceBaseValues,
  type ReferenceSourceValues,
  type ReferenceVersionValues,
} from "./reusable-reference-dialogs";

type DialogKind = "base" | "source" | "version" | null;

const REFERENCE_STATUS_KEYS = {
  active: "REFERENCE_STATUS_ACTIVE",
  disabled: "REFERENCE_STATUS_DISABLED",
  deleting: "REFERENCE_STATUS_DELETING",
  failed: "REFERENCE_STATUS_FAILED",
  fetching: "REFERENCE_STATUS_FETCHING",
  indexing: "REFERENCE_STATUS_INDEXING",
  parsing: "REFERENCE_STATUS_PARSING",
  pending: "REFERENCE_STATUS_PENDING",
  quarantined: "REFERENCE_STATUS_QUARANTINED",
  ready: "REFERENCE_STATUS_READY",
  stale: "REFERENCE_STATUS_STALE",
} as const;

const REFERENCE_SOURCE_TYPE_KEYS = {
  manual: "REFERENCE_SOURCE_TYPE_MANUAL",
  url: "REFERENCE_SOURCE_TYPE_URL",
} as const;

const REFERENCE_FRESHNESS_KEYS = {
  current: "REFERENCE_FRESHNESS_CURRENT",
  stale: "REFERENCE_FRESHNESS_STALE",
} as const;

function statusVariant(status: string) {
  if (status === "ready" || status === "active") return "default" as const;
  if (status === "disabled") return "secondary" as const;
  return "outline" as const;
}

function statusKey(status: string) {
  return (
    REFERENCE_STATUS_KEYS[status as keyof typeof REFERENCE_STATUS_KEYS] ??
    "REFERENCE_STATUS_UNKNOWN"
  );
}

function sourceTypeKey(sourceKind: string) {
  return (
    REFERENCE_SOURCE_TYPE_KEYS[sourceKind as keyof typeof REFERENCE_SOURCE_TYPE_KEYS] ??
    "REFERENCE_SOURCE_TYPE_UNKNOWN"
  );
}

function freshnessKey(freshness: string) {
  return (
    REFERENCE_FRESHNESS_KEYS[freshness as keyof typeof REFERENCE_FRESHNESS_KEYS] ??
    "REFERENCE_FRESHNESS_UNKNOWN"
  );
}

function ReferenceBaseRow(props: {
  base: KnowledgeBaseSummaryOut;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation("knowledge");
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
            {t(statusKey(props.base.status))}
          </Badge>
        </span>
        <span className="mt-1 line-clamp-2 text-caption leading-5 text-label-secondary">
          {props.base.description ?? t("REFERENCE_NO_DESCRIPTION")}
        </span>
        <span className="mt-2 block text-caption tabular-nums text-label-secondary">
          {t("REFERENCE_SOURCE_COUNT", { count: props.base.sourceCount })}
        </span>
      </span>
    </button>
  );
}

function SourceRow(props: { source: KnowledgeSourceOut; selected: boolean; onSelect: () => void }) {
  const { t } = useTranslation("knowledge");
  return (
    <button
      type="button"
      className={
        "flex w-full items-center gap-3 px-3 py-3 text-left transition-colors duration-100 " +
        (props.selected ? "bg-primary/6" : "hover:bg-accent/60")
      }
      aria-current={props.selected ? "true" : undefined}
      onClick={props.onSelect}
    >
      <FileText className="size-4 shrink-0 text-label-secondary" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-footnote font-semibold text-label-primary">
          {props.source.displayName}
        </span>
        <span className="mt-0.5 block text-caption text-label-secondary">
          {t(sourceTypeKey(props.source.sourceKind))} · {props.source.locale}
        </span>
      </span>
      <Badge variant={statusVariant(props.source.status)}>
        {t(statusKey(props.source.status))}
      </Badge>
    </button>
  );
}

function VersionList(props: { versions: readonly KnowledgeSourceVersionOut[] }) {
  const { t, i18n } = useTranslation("knowledge");
  const date = useMemo(
    () => new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, { dateStyle: "medium" }),
    [i18n.language, i18n.resolvedLanguage],
  );

  if (!props.versions.length) {
    return (
      <div className="rounded-lg border border-dashed px-4 py-8 text-center text-footnote text-label-secondary">
        {t("REFERENCE_VERSION_EMPTY")}
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
                {version.title ?? t("REFERENCE_VERSION_UNTITLED")}
              </span>
              <Badge variant={statusVariant(version.status)}>{t(statusKey(version.status))}</Badge>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-caption text-label-secondary">
              <span className="flex items-center gap-1">
                <Clock3 className="size-3" aria-hidden="true" />
                {date.format(new Date(version.createdAt))}
              </span>
              {version.chunkCount !== null ? (
                <span>{t("REFERENCE_VERSION_CHUNK_COUNT", { count: version.chunkCount })}</span>
              ) : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ReusableReferenceDirectory({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation(["knowledge", "common"]);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [selectedBaseId, setSelectedBaseId] = useState<string | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogKind>(null);

  const capabilitiesQuery = useQuery({
    queryKey: [...WORKSPACE_KNOWLEDGE_QUERY_KEY, workspaceId, "capabilities"],
    queryFn: ({ signal }) => getWorkspaceKnowledgeCapabilities(workspaceId, signal),
    retry: false,
  });
  const basesQuery = useQuery({
    queryKey: [...WORKSPACE_KNOWLEDGE_QUERY_KEY, workspaceId, "bases", deferredSearch],
    queryFn: ({ signal }) =>
      listKnowledgeBases(workspaceId, { q: deferredSearch || undefined, limit: 100, signal }),
    retry: false,
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
    retry: false,
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
    retry: false,
  });
  const versions = versionsQuery.data?.items ?? [];
  const manualSourcesAvailable = capabilitiesQuery.data?.manualSourcesAvailable === true;
  const supportsUrl = capabilitiesQuery.data?.supportedSourceKinds.includes("url") === true;
  const externalIngestionAvailable = capabilitiesQuery.data?.externalIngestionAvailable === true;

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: WORKSPACE_KNOWLEDGE_QUERY_KEY });
  const createBaseMutation = useMutation({
    mutationFn: (values: ReferenceBaseValues) =>
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
    onSuccess: async () => {
      await invalidate();
      notifySuccessText(t("knowledge:REFERENCE_CREATED"));
    },
  });
  const createSourceMutation = useMutation({
    mutationFn: (values: ReferenceSourceValues) => {
      if (!selectedBase) throw new Error("KNOWLEDGE_REFERENCE_BASE_REQUIRED");
      const locator =
        values.sourceKind === "url"
          ? { kind: "url" as const, url: values.url }
          : { kind: "manual" as const, documentKey: values.documentKey || undefined };
      return createKnowledgeSource(
        workspaceId,
        selectedBase.id,
        { displayName: values.displayName, locale: values.locale, locator },
        crypto.randomUUID(),
      );
    },
    onSuccess: async () => {
      await invalidate();
      notifySuccessText(t("knowledge:REFERENCE_SOURCE_CREATED"));
    },
  });
  const createVersionMutation = useMutation({
    mutationFn: (values: ReferenceVersionValues) => {
      if (!selectedBase || !selectedSource) throw new Error("KNOWLEDGE_REFERENCE_SOURCE_REQUIRED");
      return createManualKnowledgeSourceVersion(
        workspaceId,
        selectedBase.id,
        selectedSource.id,
        { title: values.title || null, content: values.content },
        crypto.randomUUID(),
      );
    },
    onSuccess: async () => {
      await invalidate();
      notifySuccessText(t("knowledge:REFERENCE_VERSION_CREATED"));
    },
  });
  const ingestionMutation = useMutation({
    mutationFn: (source: KnowledgeSourceOut) => {
      if (!selectedBase) throw new Error("KNOWLEDGE_REFERENCE_BASE_REQUIRED");
      return createKnowledgeSourceIngestion(
        workspaceId,
        selectedBase.id,
        source.id,
        { ingestionMode: source.activeReadyVersionId ? "refresh" : "initial" },
        crypto.randomUUID(),
      );
    },
    onSuccess: async () => {
      await invalidate();
      notifySuccessText(t("knowledge:REFERENCE_PROCESSING_QUEUED"));
    },
  });
  const commandError =
    createBaseMutation.error ??
    createSourceMutation.error ??
    createVersionMutation.error ??
    ingestionMutation.error;

  const resetCommandErrors = () => {
    createBaseMutation.reset();
    createSourceMutation.reset();
    createVersionMutation.reset();
    ingestionMutation.reset();
  };
  const canCreate = manualSourcesAvailable && !capabilitiesQuery.isError;
  const canQueueProcessing =
    selectedSource?.sourceKind !== "manual" &&
    externalIngestionAvailable &&
    !ingestionMutation.isPending;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 pb-8">
      {commandError ? (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>{t("knowledge:OPERATION_FAILED_TITLE")}</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{t("knowledge:OPERATION_FAILED_DESCRIPTION")}</span>
            <Button size="sm" variant="outline" onClick={resetCommandErrors}>
              {t("common:DISMISS")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {capabilitiesQuery.isError ? (
        <Alert variant="destructive">
          <AlertTitle>{t("knowledge:REFERENCE_CAPABILITIES_FAILED_TITLE")}</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{t("knowledge:REFERENCE_CAPABILITIES_FAILED_DESCRIPTION")}</span>
            <Button size="sm" variant="outline" onClick={() => void capabilitiesQuery.refetch()}>
              {t("common:RETRY")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {capabilitiesQuery.data && !capabilitiesQuery.data.retrievalAvailable ? (
        <Alert>
          <AlertTitle>{t("knowledge:REFERENCE_RETRIEVAL_UNAVAILABLE_TITLE")}</AlertTitle>
          <AlertDescription>
            {t("knowledge:REFERENCE_RETRIEVAL_UNAVAILABLE_DESCRIPTION")}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-label-tertiary"
            aria-hidden="true"
          />
          <Input
            className="pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label={t("knowledge:REFERENCE_SEARCH_LABEL")}
            placeholder={t("knowledge:REFERENCE_SEARCH_PLACEHOLDER")}
          />
        </div>
        <Button disabled={!canCreate} onClick={() => setDialog("base")}>
          <Plus data-icon="inline-start" />
          {t("knowledge:REFERENCE_CREATE_ACTION")}
        </Button>
      </div>

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
              <EmptyTitle>{t("knowledge:REFERENCE_DIRECTORY_EMPTY_TITLE")}</EmptyTitle>
              <EmptyDescription>
                {t("knowledge:REFERENCE_DIRECTORY_EMPTY_DESCRIPTION")}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button disabled={!canCreate} onClick={() => setDialog("base")}>
                <Plus data-icon="inline-start" />
                {t("knowledge:REFERENCE_CREATE_ACTION")}
              </Button>
            </EmptyContent>
          </Empty>
        ) : selectedBase ? (
          <div className="grid min-h-[36rem] overflow-hidden rounded-xl border bg-card lg:grid-cols-[19rem_minmax(0,1fr)]">
            <aside
              className="border-b bg-muted/30 lg:border-b-0 lg:border-r"
              aria-label={t("knowledge:REFERENCE_BASE_LIST_LABEL")}
            >
              {bases.map((base) => (
                <ReferenceBaseRow
                  key={base.id}
                  base={base}
                  selected={base.id === selectedBase.id}
                  onSelect={() => setSelectedBaseId(base.id)}
                />
              ))}
            </aside>
            <section className="min-w-0 p-4 sm:p-5" aria-labelledby="reference-base-detail-title">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2
                    id="reference-base-detail-title"
                    className="text-title3 font-semibold text-label-primary"
                  >
                    {selectedBase.name}
                  </h2>
                  <p className="mt-1 text-footnote text-label-secondary">
                    {selectedBase.description ?? t("knowledge:REFERENCE_NO_DESCRIPTION")}
                  </p>
                </div>
                <Button variant="outline" disabled={!canCreate} onClick={() => setDialog("source")}>
                  <Plus data-icon="inline-start" />
                  {t("knowledge:REFERENCE_SOURCE_CREATE_ACTION")}
                </Button>
              </div>

              <ContentGuard
                className="mt-6"
                loading={sourcesQuery.isLoading}
                error={sourcesQuery.error}
                onRetry={() => void sourcesQuery.refetch()}
                loadingVariant="form"
              >
                <div className="grid gap-6 xl:grid-cols-[minmax(14rem,0.7fr)_minmax(20rem,1.3fr)]">
                  <div>
                    <h3 className="text-headline text-label-primary">
                      {t("knowledge:REFERENCE_SOURCES_TITLE")}
                    </h3>
                    <div className="mt-3 divide-y rounded-lg border">
                      {sources.length ? (
                        sources.map((source) => (
                          <SourceRow
                            key={source.id}
                            source={source}
                            selected={source.id === selectedSource?.id}
                            onSelect={() => setSelectedSourceId(source.id)}
                          />
                        ))
                      ) : (
                        <div className="px-4 py-8 text-center text-footnote text-label-secondary">
                          {t("knowledge:REFERENCE_SOURCE_EMPTY")}
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="text-headline text-label-primary">
                        {t("knowledge:REFERENCE_VERSIONS_TITLE")}
                      </h3>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          !selectedSource || selectedSource.sourceKind !== "manual" || !canCreate
                        }
                        onClick={() => setDialog("version")}
                      >
                        <Plus data-icon="inline-start" />
                        {t("knowledge:REFERENCE_VERSION_CREATE_ACTION")}
                      </Button>
                    </div>

                    {selectedSource ? (
                      <SourceLifecycleStatus
                        source={selectedSource}
                        canQueueProcessing={Boolean(canQueueProcessing)}
                        pending={ingestionMutation.isPending}
                        onQueueProcessing={() => void ingestionMutation.mutate(selectedSource)}
                      />
                    ) : null}

                    <ContentGuard
                      className="mt-3"
                      loading={versionsQuery.isLoading}
                      error={versionsQuery.error}
                      onRetry={() => void versionsQuery.refetch()}
                      loadingVariant="form"
                    >
                      <VersionList versions={versions} />
                    </ContentGuard>
                  </div>
                </div>
              </ContentGuard>
            </section>
          </div>
        ) : null}
      </ContentGuard>

      <ReferenceBaseCreateDialog
        open={dialog === "base"}
        onOpenChange={(open) => setDialog(open ? "base" : null)}
        pending={createBaseMutation.isPending}
        onSubmit={(values) => createBaseMutation.mutateAsync(values).then(() => undefined)}
      />
      <ReferenceSourceCreateDialog
        open={dialog === "source"}
        onOpenChange={(open) => setDialog(open ? "source" : null)}
        pending={createSourceMutation.isPending}
        supportsUrl={supportsUrl}
        onSubmit={(values) => createSourceMutation.mutateAsync(values).then(() => undefined)}
      />
      <ReferenceVersionCreateDialog
        open={dialog === "version"}
        onOpenChange={(open) => setDialog(open ? "version" : null)}
        pending={createVersionMutation.isPending}
        onSubmit={(values) => createVersionMutation.mutateAsync(values).then(() => undefined)}
      />
    </div>
  );
}

function SourceLifecycleStatus(props: {
  source: KnowledgeSourceOut;
  canQueueProcessing: boolean;
  pending: boolean;
  onQueueProcessing: () => void;
}) {
  const { t } = useTranslation("knowledge");
  const actionKey = props.source.activeReadyVersionId
    ? "REFERENCE_REFRESH_ACTION"
    : props.source.safeErrorCode
      ? "REFERENCE_RETRY_ACTION"
      : "REFERENCE_PROCESS_ACTION";

  return (
    <div className="mt-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-footnote font-semibold text-label-primary">
            {t("REFERENCE_SOURCE_STATUS_TITLE")}
          </p>
          <p className="mt-1 text-caption text-label-secondary">
            {t("REFERENCE_FRESHNESS_STATUS", {
              freshness: t(freshnessKey(props.source.servingFreshness)),
            })}
          </p>
        </div>
        {props.source.sourceKind !== "manual" ? (
          <Button
            size="sm"
            variant="outline"
            disabled={!props.canQueueProcessing}
            loading={props.pending}
            onClick={props.onQueueProcessing}
          >
            <RefreshCw data-icon="inline-start" />
            {t(actionKey)}
          </Button>
        ) : null}
      </div>
      {props.source.safeErrorCode ? (
        <Alert className="mt-3" variant="destructive">
          <AlertTitle>{t("REFERENCE_PROCESSING_FAILED_TITLE")}</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{t("REFERENCE_PROCESSING_FAILED_DESCRIPTION")}</p>
            <code className="block break-all text-caption text-label-secondary">
              {t("REFERENCE_PROCESSING_ERROR_CODE_LABEL")}: {props.source.safeErrorCode}
            </code>
          </AlertDescription>
        </Alert>
      ) : null}
      {props.source.sourceKind !== "manual" && !props.canQueueProcessing ? (
        <p className="mt-3 text-caption text-label-secondary">
          {t("REFERENCE_PROCESSING_UNAVAILABLE")}
        </p>
      ) : null}
    </div>
  );
}
