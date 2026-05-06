import {
  getContentItem,
  getContentItemVersion,
  getContentLibraryViews,
  listAllContentItems,
  listAllContentModels,
  listContentItemTranslations,
  listContentItemVersions,
} from "@/api/content";
import type {
  AdminContentBootstrapPresetState,
  AdminContentItem,
  AdminContentItemStatus,
  AdminContentItemVisibility,
  AdminContentLibraryViewsState,
  AdminContentModel,
  AdminContentPresentation,
  AdminContentPresentationKind,
  AdminContentItemPublishReadiness,
  AdminContentShapeState,
  AdminContentVersion,
  AdminContentVersionState,
  AdminContentWorkflowStage,
  ListAdminContentVersionsParams,
  PageData,
} from "@arclayer/openapi/admin-types";
import type { ContentLibraryTableRow } from "../types";

export const CONTENT_LIBRARY_VERSION_HISTORY_PAGE_SIZE = 30;

export type ContentLibraryArticleEditorSnapshot = {
  item: AdminContentItem;
  draftVersion: AdminContentVersion | null;
  publishedVersion: AdminContentVersion | null;
  bodyPresentation: AdminContentPresentation | null;
};

export type ContentLibraryArticleEditorSaveState = "hidden" | "saving" | "saved" | "error";

export type ContentLibraryArticleEditorViewState = "draft" | "published" | "preview";

export type ContentLibraryArticleEditorRuntimeState = {
  currentView: ContentLibraryArticleEditorViewState;
  saveState: ContentLibraryArticleEditorSaveState;
  saveError: unknown;
  isLoading: boolean;
  isPublishing: boolean;
  hasUnsavedChanges: boolean;
  hasPublishableVersion: boolean;
  autosave: {
    enabled: boolean;
    intervalSec: number;
    saveOnBlur: boolean;
  };
  version: {
    draftNumber: number | null;
    draftState: AdminContentVersionState | null;
    publishedNumber: number | null;
  };
  status: {
    itemStatus: AdminContentItemStatus;
    visibility: AdminContentItemVisibility;
    shapeState: AdminContentShapeState | null;
    bootstrapPresetState: AdminContentBootstrapPresetState | null;
  };
  workflow: {
    stage: AdminContentWorkflowStage;
    assigneeUserId: string | null;
    summary: string | null;
    publishReadiness: AdminContentItemPublishReadiness | null;
  };
  badges: ContentLibraryRuntimeBadge[];
  diagnostics: ContentLibraryRuntimeDiagnostic[];
};

export type ContentLibraryRuntimeBadgeTone = "default" | "green" | "blue" | "red" | "gold";

export type ContentLibraryRuntimeBadge = {
  id:
    | "published"
    | "changed"
    | "draft"
    | "archived"
    | "has-draft"
    | "shape-ready"
    | "shape-blocked"
    | "shape-unshaped"
    | "bootstrap-customized";
  labelKey: string;
  tone: ContentLibraryRuntimeBadgeTone;
};

export type ContentLibraryRuntimeDiagnostic = {
  id: "shape-ready" | "shape-blocked" | "shape-unshaped" | "has-draft" | "bootstrap-customized";
  labelKey: string;
  tone: ContentLibraryRuntimeBadgeTone;
};

type ContentLibraryArticleEditorRuntimeItem = Pick<
  AdminContentItem,
  | "bootstrapPresetState"
  | "derivedStatus"
  | "publishedVersion"
  | "shapeState"
  | "status"
  | "visibility"
  | "workflowAssigneeUserId"
  | "workflowStage"
  | "workflowSummary"
> & {
  publishReadiness?: AdminContentItemPublishReadiness | null;
};

export function buildContentLibraryItemsQueryKey(projectId: string | null) {
  return ["content-library-runtime", "items", "all", projectId] as const;
}

export function buildContentLibraryModelsQueryKey(projectId: string | null) {
  return ["content-library-runtime", "models", "all", projectId] as const;
}

export function buildContentLibraryViewsQueryKey(projectId: string | null) {
  return ["content-library-runtime", "views", projectId] as const;
}

export function buildContentLibraryItemQueryKey(projectId: string | null, itemId: string | null) {
  return ["content-library-runtime", "item", projectId, itemId] as const;
}

export function buildContentLibraryVersionHistoryQueryKey(
  projectId: string | null,
  itemId: string | null,
) {
  return ["content-library-runtime", "item", projectId, itemId, "versions"] as const;
}

export function buildContentLibraryItemTranslationsQueryKey(
  projectId: string | null,
  itemId: string | null,
) {
  return ["content-library-runtime", "item", projectId, itemId, "translations"] as const;
}

export function loadContentLibraryItems(projectId: string): Promise<AdminContentItem[]> {
  return listAllContentItems(projectId);
}

export function loadContentLibraryModels(projectId: string): Promise<AdminContentModel[]> {
  return listAllContentModels(projectId);
}

export function loadContentLibraryViewsState(
  projectId: string,
): Promise<AdminContentLibraryViewsState> {
  return getContentLibraryViews(projectId);
}

export function loadContentLibraryItemRuntime(
  projectId: string,
  itemId: string,
): Promise<AdminContentItem> {
  return getContentItem(projectId, itemId);
}

export function loadContentLibraryItemTranslations(projectId: string, itemId: string) {
  return listContentItemTranslations(projectId, itemId);
}

export function loadContentLibraryVersionHistory(
  projectId: string,
  itemId: string,
  params: ListAdminContentVersionsParams = {},
): Promise<PageData<AdminContentVersion>> {
  return listContentItemVersions(projectId, itemId, {
    page: params.page ?? 1,
    size: params.size ?? CONTENT_LIBRARY_VERSION_HISTORY_PAGE_SIZE,
  });
}

export function buildContentLibraryRuntimeBadges(
  row: Pick<
    ContentLibraryTableRow,
    "bootstrapPresetState" | "derivedStatus" | "draftVersion" | "publishedVersion" | "shapeState"
  >,
): ContentLibraryRuntimeBadge[] {
  const badges: ContentLibraryRuntimeBadge[] = [];

  if (row.derivedStatus === "published") {
    badges.push({
      id: "published",
      labelKey: "CONTENT_LIBRARY_STATUS_PUBLISHED",
      tone: "green",
    });
  } else if (row.derivedStatus === "changed") {
    badges.push({
      id: "changed",
      labelKey: "CONTENT_LIBRARY_STATUS_CHANGED",
      tone: "gold",
    });
  } else if (row.derivedStatus === "archived") {
    badges.push({
      id: "archived",
      labelKey: "CONTENT_LIBRARY_STATUS_ARCHIVED",
      tone: "red",
    });
  } else {
    badges.push({
      id: "draft",
      labelKey: "CONTENT_LIBRARY_STATUS_DRAFT",
      tone: "default",
    });
  }

  if (
    typeof row.publishedVersion === "number" &&
    row.publishedVersion > 0 &&
    typeof row.draftVersion === "number" &&
    row.draftVersion > row.publishedVersion
  ) {
    badges.push({
      id: "has-draft",
      labelKey: "CONTENT_LIBRARY_BADGE_HAS_DRAFT",
      tone: "blue",
    });
  }

  if (row.bootstrapPresetState === "customized") {
    badges.push({
      id: "bootstrap-customized",
      labelKey: "CONTENT_LIBRARY_BADGE_BOOTSTRAP_CUSTOMIZED",
      tone: "gold",
    });
  }

  if (row.shapeState === "ready") {
    badges.push({
      id: "shape-ready",
      labelKey: "CONTENT_LIBRARY_BADGE_SHAPE_READY",
      tone: "green",
    });
  } else if (row.shapeState === "blocked") {
    badges.push({
      id: "shape-blocked",
      labelKey: "CONTENT_LIBRARY_BADGE_SHAPE_BLOCKED",
      tone: "red",
    });
  } else if (row.shapeState === "unshaped") {
    badges.push({
      id: "shape-unshaped",
      labelKey: "CONTENT_LIBRARY_BADGE_SHAPE_UNSHAPED",
      tone: "gold",
    });
  }

  return badges;
}

export function buildContentLibraryRuntimeDiagnostics(
  row: Pick<
    ContentLibraryTableRow,
    "bootstrapPresetState" | "draftVersion" | "publishedVersion" | "shapeState"
  >,
): ContentLibraryRuntimeDiagnostic[] {
  const diagnostics: ContentLibraryRuntimeDiagnostic[] = [];

  if (row.shapeState === "ready") {
    diagnostics.push({
      id: "shape-ready",
      labelKey: "CONTENT_LIBRARY_DIAGNOSTIC_READY",
      tone: "green",
    });
  } else if (row.shapeState === "blocked") {
    diagnostics.push({
      id: "shape-blocked",
      labelKey: "CONTENT_LIBRARY_DIAGNOSTIC_BLOCKED",
      tone: "red",
    });
  } else if (row.shapeState === "unshaped") {
    diagnostics.push({
      id: "shape-unshaped",
      labelKey: "CONTENT_LIBRARY_DIAGNOSTIC_UNSHAPED",
      tone: "gold",
    });
  }

  if (
    typeof row.publishedVersion === "number" &&
    row.publishedVersion > 0 &&
    typeof row.draftVersion === "number" &&
    row.draftVersion > row.publishedVersion
  ) {
    diagnostics.push({
      id: "has-draft",
      labelKey: "CONTENT_LIBRARY_DIAGNOSTIC_HAS_DRAFT",
      tone: "blue",
    });
  }

  if (row.bootstrapPresetState === "customized") {
    diagnostics.push({
      id: "bootstrap-customized",
      labelKey: "CONTENT_LIBRARY_DIAGNOSTIC_BOOTSTRAP_CUSTOMIZED",
      tone: "gold",
    });
  }

  return diagnostics;
}

export function buildContentLibraryArticleEditorRuntimeState(params: {
  autosave: {
    enabled: boolean;
    intervalSec: number;
    saveOnBlur: boolean;
  };
  draftVersionNumber: number | null;
  draftVersionState: AdminContentVersionState | null;
  hasUnsavedChanges: boolean;
  isLoading: boolean;
  isPublishing: boolean;
  item: ContentLibraryArticleEditorRuntimeItem;
  publishedVersionNumber: number | null;
  saveError: unknown;
  saveState: ContentLibraryArticleEditorSaveState;
}): ContentLibraryArticleEditorRuntimeState {
  const publishedVersionNumber =
    params.publishedVersionNumber ?? params.item.publishedVersion ?? null;
  const draftVersionNumber = params.draftVersionNumber ?? 0;
  const badges = buildContentLibraryRuntimeBadges({
    bootstrapPresetState: params.item.bootstrapPresetState ?? "none",
    derivedStatus: params.item.derivedStatus,
    draftVersion: draftVersionNumber,
    publishedVersion: publishedVersionNumber,
    shapeState: params.item.shapeState ?? "unshaped",
  });
  const diagnostics = buildContentLibraryRuntimeDiagnostics({
    bootstrapPresetState: params.item.bootstrapPresetState ?? "none",
    draftVersion: draftVersionNumber,
    publishedVersion: publishedVersionNumber,
    shapeState: params.item.shapeState ?? "unshaped",
  });
  const currentView: ContentLibraryArticleEditorViewState =
    params.isPublishing || params.item.status === "published" ? "published" : "draft";

  return {
    currentView,
    saveState: params.saveState,
    saveError: params.saveError,
    isLoading: params.isLoading,
    isPublishing: params.isPublishing,
    hasUnsavedChanges: params.hasUnsavedChanges,
    hasPublishableVersion:
      typeof params.draftVersionNumber === "number" && params.draftVersionNumber > 0,
    autosave: params.autosave,
    version: {
      draftNumber: params.draftVersionNumber,
      draftState: params.draftVersionState,
      publishedNumber: publishedVersionNumber,
    },
    status: {
      itemStatus: params.item.status,
      visibility: params.item.visibility,
      shapeState: params.item.shapeState ?? null,
      bootstrapPresetState: params.item.bootstrapPresetState ?? null,
    },
    workflow: {
      stage: params.item.workflowStage ?? "drafting",
      assigneeUserId: params.item.workflowAssigneeUserId ?? null,
      summary: params.item.workflowSummary ?? null,
      publishReadiness: params.item.publishReadiness ?? null,
    },
    badges,
    diagnostics,
  };
}

export function findArticleEditorPresentation(
  version: AdminContentVersion | null,
  kind: AdminContentPresentationKind,
): AdminContentPresentation | null {
  if (!version) return null;
  return version.presentations.find((presentation) => presentation.kind === kind) ?? null;
}

export async function loadContentLibraryArticleEditorSnapshot(
  projectId: string,
  itemId: string,
): Promise<ContentLibraryArticleEditorSnapshot> {
  const item = await loadContentLibraryItemRuntime(projectId, itemId);
  const [draftVersion, publishedVersion] = await Promise.all([
    item.draftVersion > 0
      ? getContentItemVersion(projectId, itemId, item.draftVersion)
      : Promise.resolve(null),
    item.publishedVersion
      ? getContentItemVersion(projectId, itemId, item.publishedVersion)
      : Promise.resolve(null),
  ]);

  return {
    item,
    draftVersion,
    publishedVersion,
    bodyPresentation: findArticleEditorPresentation(draftVersion, "rich_text_document"),
  };
}
