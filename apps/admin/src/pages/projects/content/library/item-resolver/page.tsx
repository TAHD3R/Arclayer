import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/layouts/page-shell/default-page";
import {
  resolveContentItemContinuationRoute,
  resolveContentItemContinuationTarget,
  projectContentLibraryPath,
} from "@/lib/routing/project-content-routing";
import {
  buildContentLibraryItemQueryKey,
  loadContentLibraryItemRuntime,
} from "@/pages/projects/content/library/runtime";
import type {
  AdminContentItem,
  AdminContentOpenIntent,
  AdminContentRecoveryAction,
} from "@/types/api";
import { Button } from "@arclayer/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@arclayer/ui/card";

import { ContentLibraryDetailSummaryStrip } from "../components/content-library-detail-summary-strip";
import { ContentLibraryArticleEditorPage } from "../article-editor/page";
import { ContentSiteBuilderPage } from "../../site-builder/page";
import { ContentStructuredSurfacePage } from "../../structured/page";

function getContinuationSurfaceLabel(
  item: Pick<AdminContentItem, "resolvedSurface">,
  intent: AdminContentOpenIntent | null,
) {
  return intent?.surface ?? item.resolvedSurface ?? "unknown";
}

function getContinuationReasonCode(
  item: Pick<AdminContentItem, "shapeReasonCode">,
  intent: AdminContentOpenIntent | null,
) {
  return intent?.reasonCode ?? item.shapeReasonCode ?? "CONTINUATION_TRUTH_MISSING";
}

function getContinuationReasonMeta(
  item: Pick<AdminContentItem, "shapeReasonMeta">,
  intent: AdminContentOpenIntent | null,
) {
  return intent?.reasonMeta ?? item.shapeReasonMeta ?? null;
}

function RecoveryActionButton(props: { action: AdminContentRecoveryAction }) {
  if (!props.action.route) {
    return (
      <Button type="button" variant="outline" disabled>
        {props.action.label}
      </Button>
    );
  }

  return (
    <Button asChild type="button" variant="outline">
      <a href={props.action.route}>{props.action.label}</a>
    </Button>
  );
}

function ContinuationStatePage(props: {
  item: AdminContentItem;
  intent: AdminContentOpenIntent | null;
  mode: "blocked" | "boundary" | "error";
  onRetry?: () => void;
}) {
  const { t } = useTranslation(["content", "common"]);
  const itemLabel = props.item.title?.trim() || props.item.slug;
  const surface = getContinuationSurfaceLabel(props.item, props.intent);
  const reasonCode = getContinuationReasonCode(props.item, props.intent);
  const reasonMeta = getContinuationReasonMeta(props.item, props.intent);
  const actions =
    props.intent?.recoveryActions && props.intent.recoveryActions.length > 0
      ? props.intent.recoveryActions
      : [];

  const title =
    props.mode === "blocked"
      ? t("content:CONTENT_ITEM_CONTINUATION_BLOCKED_TITLE")
      : props.mode === "boundary"
        ? t("content:CONTENT_ITEM_CONTINUATION_SURFACE_UNAVAILABLE_TITLE")
        : t("content:CONTENT_ITEM_CONTINUATION_LOAD_ERROR_TITLE");
  const description =
    props.mode === "blocked"
      ? t("content:CONTENT_ITEM_CONTINUATION_BLOCKED_DESC")
      : props.mode === "boundary"
        ? t("content:CONTENT_ITEM_CONTINUATION_SURFACE_UNAVAILABLE_DESC", { surface })
        : t("content:CONTENT_ITEM_CONTINUATION_LOAD_ERROR_DESC");

  return (
    <DefaultPage title={title} description={description} showFavoriteToggle={false}>
      <Card data-testid="content-item-continuation-state">
        <CardHeader>
          <CardTitle>{itemLabel}</CardTitle>
          <CardDescription>
            {resolveContentItemContinuationRoute(props.item) ?? "--"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ContentLibraryDetailSummaryStrip
            row={{
              bootstrapPresetState: props.item.bootstrapPresetState ?? "none",
              derivedStatus: props.item.derivedStatus ?? "draft",
              draftVersion: props.item.draftVersion,
              name: itemLabel,
              publishedVersion: props.item.publishedVersion ?? null,
              shapeState: props.item.shapeState,
              slug: props.item.slug,
              summary: t("content:CONTENT_ITEM_CONTINUATION_SURFACE_UNAVAILABLE_DESC", { surface }),
              visibility: props.item.visibility,
            }}
          />
          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <dt className="text-footnote text-label-secondary">
                {t("content:CONTENT_ITEM_CONTINUATION_FIELD_SURFACE")}
              </dt>
              <dd className="text-body text-label-primary">
                <code>{surface}</code>
              </dd>
            </div>
            <div className="space-y-1">
              <dt className="text-footnote text-label-secondary">
                {t("content:CONTENT_ITEM_CONTINUATION_FIELD_REASON_CODE")}
              </dt>
              <dd className="text-body text-label-primary">
                <code>{reasonCode}</code>
              </dd>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <dt className="text-footnote text-label-secondary">
                {t("content:CONTENT_ITEM_CONTINUATION_FIELD_ROUTE")}
              </dt>
              <dd className="break-all text-body text-label-primary">
                {resolveContentItemContinuationRoute(props.item) ?? "--"}
              </dd>
            </div>
          </dl>
          {reasonMeta ? (
            <div className="space-y-2">
              <div className="text-footnote text-label-secondary">
                {t("content:CONTENT_ITEM_CONTINUATION_FIELD_REASON_META")}
              </div>
              <pre className="overflow-x-auto rounded-lg border border-border/70 bg-muted/40 p-3 text-footnote text-label-primary">
                {JSON.stringify(reasonMeta, null, 2)}
              </pre>
            </div>
          ) : null}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-3">
          <Button asChild type="button">
            <a href={projectContentLibraryPath(props.item.workspaceId)}>
              {t("content:CONTENT_ITEM_CONTINUATION_ACTION_BACK_TO_LIBRARY")}
            </a>
          </Button>
          {props.mode === "error" ? (
            <Button type="button" variant="outline" onClick={props.onRetry}>
              {t("common:RETRY")}
            </Button>
          ) : null}
          {actions.map((action) => (
            <RecoveryActionButton
              key={`${action.kind}:${action.route ?? "none"}`}
              action={action}
            />
          ))}
        </CardFooter>
      </Card>
    </DefaultPage>
  );
}

function ContinuationLoadingPage() {
  const { t } = useTranslation(["content", "common"]);

  return (
    <DefaultPage
      title={t("content:CONTENT_ITEM_CONTINUATION_LOADING_TITLE")}
      description={t("content:CONTENT_ITEM_CONTINUATION_LOADING_DESC")}
      showFavoriteToggle={false}
    >
      <Card data-testid="content-item-continuation-loading">
        <CardContent className="pt-6 text-body text-label-secondary">
          {t("common:LOADING")}
        </CardContent>
      </Card>
    </DefaultPage>
  );
}

export function ContentLibraryItemResolverPage(props: { projectId: string; itemId: string }) {
  const itemQuery = useQuery({
    queryKey: buildContentLibraryItemQueryKey(props.projectId, props.itemId),
    queryFn: () => loadContentLibraryItemRuntime(props.projectId, props.itemId),
    retry: false,
    meta: { silent: true },
  });

  if (itemQuery.isLoading) {
    return <ContinuationLoadingPage />;
  }

  if (itemQuery.isError || !itemQuery.data) {
    const emptyItem: AdminContentItem = {
      id: props.itemId,
      workspaceId: props.projectId,
      siteId: "",
      slug: props.itemId,
      status: "draft",
      visibility: "private",
      locale: "en-US",
      bootstrapPresetState: "none",
      capabilityPackIds: [],
      derivedStatus: "draft",
      runtime: "unknown",
      context: "standalone",
      libraryGroup: "general-content",
      editWith: "structured",
      role: "general",
      shapeState: "blocked",
      draftVersion: 0,
      updatedAt: "",
    };

    return (
      <ContinuationStatePage
        item={emptyItem}
        intent={null}
        mode="error"
        onRetry={() => void itemQuery.refetch()}
      />
    );
  }

  const item = itemQuery.data;
  const intent = resolveContentItemContinuationTarget(item);

  if (intent?.blocked || item.shapeState !== "ready") {
    return <ContinuationStatePage item={item} intent={intent} mode="blocked" />;
  }

  if (intent?.surface === "writing") {
    return <ContentLibraryArticleEditorPage workspaceId={props.projectId} itemId={props.itemId} />;
  }

  if (intent?.surface === "structured") {
    return <ContentStructuredSurfacePage workspaceId={props.projectId} item={item} />;
  }

  if (intent?.surface === "canvas") {
    return <ContentSiteBuilderPage projectId={props.projectId} item={item} />;
  }

  return <ContinuationStatePage item={item} intent={intent} mode="boundary" />;
}
