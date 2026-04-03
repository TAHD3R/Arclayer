import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import {
  patchContentItemVersion,
  publishContentItemVersion,
  saveContentItemDraftVersion,
} from "@/api/content";
import { getCoreSettings } from "@/api/settings";
import { readWorkspaceContentStrategy } from "@/lib/settings/workspace-content-strategy";
import type {
  AdminContentItemStatus,
  AdminContentItemVisibility,
  AdminContentPresentation,
  AdminContentVersion,
  AdminContentVersionState,
} from "@/types/api";

import { findArticleEditorPresentation, loadContentLibraryArticleEditorSnapshot } from "./api";

const SAVE_FEEDBACK_DURATION_MS = 1800;
const EMPTY_ARTICLE_DOCUMENT = { type: "doc", content: [] } as const;
const MANAGED_FIELD_KEYS = new Set([
  "title",
  "summary",
  "slug",
  "status",
  "visibility",
  "coverAssetId",
]);
const MANAGED_PRESENTATION_KINDS = new Set(["rich_text_document", "seo"]);

type ContentLibraryArticleEditorSeoDraft = {
  metaTitle: string;
  metaDescription: string;
  canonicalUrl: string;
  robotsDirective: string;
  payload: Record<string, unknown> | null;
};

type ContentLibraryArticleEditorDraft = {
  title: string;
  summary: string;
  slug: string;
  status: AdminContentItemStatus;
  visibility: AdminContentItemVisibility;
  coverAssetId: string;
  bodyDocument: Record<string, unknown>;
  seo: ContentLibraryArticleEditorSeoDraft;
};

type ContentLibraryArticleEditorSaveState = "hidden" | "saving" | "saved" | "error";

function readStringField(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  return typeof value === "string" ? value : "";
}

function readStatusField(
  source: Record<string, unknown>,
  fallback: AdminContentItemStatus,
): AdminContentItemStatus {
  const value = source.status;
  return value === "draft" || value === "published" || value === "archived" ? value : fallback;
}

function readVisibilityField(
  source: Record<string, unknown>,
  fallback: AdminContentItemVisibility,
): AdminContentItemVisibility {
  return source.visibility === "private" ? "private" : fallback;
}

function readCoverAssetIdField(source: Record<string, unknown>): string {
  return readStringField(source, "coverAssetId");
}

function normalizeDocument(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return { ...EMPTY_ARTICLE_DOCUMENT };
}

function normalizeSeoDraft(payload: unknown): ContentLibraryArticleEditorSeoDraft {
  const source =
    payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  return {
    metaTitle: source ? readStringField(source, "metaTitle") : "",
    metaDescription: source ? readStringField(source, "metaDescription") : "",
    canonicalUrl: source ? readStringField(source, "canonicalUrl") : "",
    robotsDirective: source ? readStringField(source, "robotsDirective") : "",
    payload: source ? { ...source } : null,
  };
}

function buildDraftFromVersion(params: {
  item: {
    title?: string | null;
    slug: string;
    status: AdminContentItemStatus;
    visibility: AdminContentItemVisibility;
  };
  version: AdminContentVersion | null;
  initialTitle?: string;
  initialSummary?: string;
}): ContentLibraryArticleEditorDraft {
  const fieldsSnapshot = params.version?.fieldsSnapshot ?? {};
  const bodyPresentation = findArticleEditorPresentation(params.version, "rich_text_document");
  const seoPresentation = findArticleEditorPresentation(params.version, "seo");

  return {
    title:
      readStringField(fieldsSnapshot, "title") || params.item.title || params.initialTitle || "",
    summary: readStringField(fieldsSnapshot, "summary") || params.initialSummary || "",
    slug: readStringField(fieldsSnapshot, "slug") || params.item.slug || "",
    status: readStatusField(fieldsSnapshot, params.item.status),
    visibility: readVisibilityField(fieldsSnapshot, params.item.visibility),
    coverAssetId: readCoverAssetIdField(fieldsSnapshot),
    bodyDocument: normalizeDocument(bodyPresentation?.payload),
    seo: normalizeSeoDraft(seoPresentation?.payload),
  };
}

function cloneDraft(draft: ContentLibraryArticleEditorDraft): ContentLibraryArticleEditorDraft {
  return {
    ...draft,
    bodyDocument: { ...draft.bodyDocument },
    seo: {
      ...draft.seo,
      payload: draft.seo.payload ? { ...draft.seo.payload } : null,
    },
  };
}

function omitManagedFields(source: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(source).filter(([key]) => !MANAGED_FIELD_KEYS.has(key)));
}

function omitManagedPresentations(source: AdminContentPresentation[]): AdminContentPresentation[] {
  return source
    .filter((presentation) => !MANAGED_PRESENTATION_KINDS.has(presentation.kind))
    .map((presentation) => ({
      kind: presentation.kind,
      payload:
        presentation.payload && typeof presentation.payload === "object"
          ? { ...presentation.payload }
          : (presentation.payload ?? null),
    }));
}

function normalizeDraftForCompare(draft: ContentLibraryArticleEditorDraft) {
  return {
    ...draft,
    bodyDocument: draft.bodyDocument ?? EMPTY_ARTICLE_DOCUMENT,
    seo: {
      ...draft.seo,
      payload: draft.seo.payload
        ? Object.fromEntries(
            Object.entries(draft.seo.payload).sort(([left], [right]) => left.localeCompare(right)),
          )
        : null,
    },
  };
}

function areDraftsEqual(
  left: ContentLibraryArticleEditorDraft | null,
  right: ContentLibraryArticleEditorDraft | null,
) {
  return (
    JSON.stringify(
      normalizeDraftForCompare(
        left ??
          buildDraftFromVersion({
            item: { title: "", slug: "", status: "draft", visibility: "public" },
            version: null,
          }),
      ),
    ) ===
    JSON.stringify(
      normalizeDraftForCompare(
        right ??
          buildDraftFromVersion({
            item: { title: "", slug: "", status: "draft", visibility: "public" },
            version: null,
          }),
      ),
    )
  );
}

function buildSeoPresentation(
  draft: ContentLibraryArticleEditorSeoDraft,
): AdminContentPresentation | null {
  const payload = draft.payload ? { ...draft.payload } : {};
  if (draft.metaTitle.trim()) payload.metaTitle = draft.metaTitle.trim();
  else delete payload.metaTitle;
  if (draft.metaDescription.trim()) payload.metaDescription = draft.metaDescription.trim();
  else delete payload.metaDescription;
  if (draft.canonicalUrl.trim()) payload.canonicalUrl = draft.canonicalUrl.trim();
  else delete payload.canonicalUrl;
  if (draft.robotsDirective.trim()) payload.robotsDirective = draft.robotsDirective.trim();
  else delete payload.robotsDirective;

  return Object.keys(payload).length > 0 ? { kind: "seo", payload } : null;
}

function buildManagedFieldsSnapshot(draft: ContentLibraryArticleEditorDraft) {
  return {
    title: draft.title,
    summary: draft.summary,
    slug: draft.slug.trim(),
    status: draft.status,
    visibility: draft.visibility,
    coverAssetId: draft.coverAssetId.trim() || null,
  };
}

function buildPersistedDraftPayload(params: {
  draft: ContentLibraryArticleEditorDraft;
  otherFieldsSnapshot: Record<string, unknown>;
  otherPresentations: AdminContentPresentation[];
}) {
  const seoPresentation = buildSeoPresentation(params.draft.seo);
  const presentations: AdminContentPresentation[] = [
    ...params.otherPresentations,
    { kind: "rich_text_document", payload: params.draft.bodyDocument },
    ...(seoPresentation ? [seoPresentation] : []),
  ];

  return {
    fieldsSnapshot: {
      ...params.otherFieldsSnapshot,
      ...buildManagedFieldsSnapshot(params.draft),
    },
    presentations,
  };
}

function useLatestValue<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

export function useContentLibraryArticleEditor(params: {
  workspaceId: string;
  itemId: string;
  initialTitle?: string;
  initialSummary?: string;
}) {
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<unknown>(null);
  const [saveState, setSaveState] = React.useState<ContentLibraryArticleEditorSaveState>("hidden");
  const [saveError, setSaveError] = React.useState<unknown>(null);
  const [isPublishing, setIsPublishing] = React.useState(false);
  const [draft, setDraft] = React.useState<ContentLibraryArticleEditorDraft>({
    title: params.initialTitle ?? "",
    summary: params.initialSummary ?? "",
    slug: "",
    status: "draft",
    visibility: "public",
    coverAssetId: "",
    bodyDocument: { ...EMPTY_ARTICLE_DOCUMENT },
    seo: normalizeSeoDraft(null),
  });
  const [currentVersionNumber, setCurrentVersionNumber] = React.useState<number | null>(null);
  const [currentVersionState, setCurrentVersionState] =
    React.useState<AdminContentVersionState | null>(null);
  const [publishedVersionNumber, setPublishedVersionNumber] = React.useState<number | null>(null);

  const contentStrategyQuery = useQuery({
    queryKey: ["settings", "workspace", "core", params.workspaceId],
    enabled: Boolean(params.workspaceId),
    queryFn: async () => getCoreSettings(params.workspaceId),
    staleTime: 5 * 60 * 1000,
    meta: { silent: true },
  });
  const contentStrategy = React.useMemo(
    () => readWorkspaceContentStrategy(contentStrategyQuery.data?.value),
    [contentStrategyQuery.data?.value],
  );

  const latestDraftRef = useLatestValue(draft);
  const liveBodyDocumentRef = React.useRef<Record<string, unknown>>(draft.bodyDocument);
  const currentVersionNumberRef = useLatestValue(currentVersionNumber);
  const currentVersionStateRef = useLatestValue(currentVersionState);
  const saveStateRef = useLatestValue(saveState);
  const isLoadingRef = useLatestValue(isLoading);
  const errorRef = useLatestValue(error);
  const isPublishingRef = useLatestValue(isPublishing);
  const autosaveStrategyRef = useLatestValue(contentStrategy.autosave);
  const autosaveTimerRef = React.useRef<number | null>(null);
  const saveFeedbackTimerRef = React.useRef<number | null>(null);
  const isPersistingRef = React.useRef(false);
  const inFlightPersistRef = React.useRef<Promise<AdminContentVersion | null> | null>(null);
  const queuedPersistRef = React.useRef<ContentLibraryArticleEditorDraft | null>(null);
  const lastSavedDraftRef = React.useRef<ContentLibraryArticleEditorDraft | null>(null);
  const otherFieldsSnapshotRef = React.useRef<Record<string, unknown>>({});
  const otherPresentationsRef = React.useRef<AdminContentPresentation[]>([]);

  const clearAutosaveTimer = React.useCallback(() => {
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
  }, []);

  const clearSaveFeedbackTimer = React.useCallback(() => {
    if (saveFeedbackTimerRef.current) {
      window.clearTimeout(saveFeedbackTimerRef.current);
      saveFeedbackTimerRef.current = null;
    }
  }, []);

  const showSavedFeedback = React.useCallback(() => {
    clearSaveFeedbackTimer();
    setSaveState("saved");
    saveFeedbackTimerRef.current = window.setTimeout(() => {
      saveFeedbackTimerRef.current = null;
      setSaveState("hidden");
    }, SAVE_FEEDBACK_DURATION_MS);
  }, [clearSaveFeedbackTimer]);

  const readCurrentDraft = React.useCallback(
    (override?: Partial<ContentLibraryArticleEditorDraft>): ContentLibraryArticleEditorDraft => {
      const baseDraft = latestDraftRef.current;
      return cloneDraft({
        ...baseDraft,
        ...override,
        bodyDocument:
          override?.bodyDocument === undefined
            ? normalizeDocument(liveBodyDocumentRef.current)
            : normalizeDocument(override.bodyDocument),
      });
    },
    [latestDraftRef],
  );

  const applyPersistedVersion = React.useCallback(
    (
      version: AdminContentVersion,
      nextDraft: ContentLibraryArticleEditorDraft,
      nextPublishedVersionNumber: number | null,
    ) => {
      otherFieldsSnapshotRef.current = omitManagedFields(version.fieldsSnapshot ?? {});
      otherPresentationsRef.current = omitManagedPresentations(version.presentations ?? []);
      lastSavedDraftRef.current = cloneDraft(nextDraft);
      liveBodyDocumentRef.current = normalizeDocument(nextDraft.bodyDocument);
      setDraft(cloneDraft(nextDraft));
      setCurrentVersionNumber(version.versionNumber);
      setCurrentVersionState(version.state);
      setPublishedVersionNumber(nextPublishedVersionNumber);
      setSaveError(null);
    },
    [],
  );

  const persistDraft = React.useCallback(
    async (
      overrideDraft?: ContentLibraryArticleEditorDraft,
    ): Promise<AdminContentVersion | null> => {
      const nextDraft = cloneDraft(overrideDraft ?? readCurrentDraft());
      const hasChanges = !areDraftsEqual(nextDraft, lastSavedDraftRef.current);

      if (!hasChanges) {
        return currentVersionNumberRef.current
          ? {
              itemId: params.itemId,
              versionNumber: currentVersionNumberRef.current,
              state: currentVersionStateRef.current ?? "draft",
              createdAt: "",
              fieldsSnapshot: {},
              presentations: [],
            }
          : null;
      }

      if (isPersistingRef.current) {
        queuedPersistRef.current = nextDraft;
        return inFlightPersistRef.current ?? null;
      }

      clearAutosaveTimer();
      clearSaveFeedbackTimer();

      setSaveState("saving");
      setSaveError(null);
      isPersistingRef.current = true;

      const payload = buildPersistedDraftPayload({
        draft: nextDraft,
        otherFieldsSnapshot: otherFieldsSnapshotRef.current,
        otherPresentations: otherPresentationsRef.current,
      });

      const request =
        currentVersionNumberRef.current && currentVersionStateRef.current === "draft"
          ? patchContentItemVersion(
              params.workspaceId,
              params.itemId,
              currentVersionNumberRef.current,
              {
                changeSummary: "Update article draft",
                ...payload,
              },
            )
          : saveContentItemDraftVersion(params.workspaceId, params.itemId, {
              expectedVersion: currentVersionNumberRef.current,
              changeSummary: "Update article draft",
              ...payload,
            });

      const inFlight = request
        .then((version) => {
          const nextPublishedVersionNumber =
            version.state === "published"
              ? version.versionNumber
              : (publishedVersionNumber ?? null);
          applyPersistedVersion(version, nextDraft, nextPublishedVersionNumber);
          showSavedFeedback();
          return version;
        })
        .catch((nextError) => {
          clearSaveFeedbackTimer();
          setSaveError(nextError);
          setSaveState("error");
          throw nextError;
        })
        .finally(() => {
          isPersistingRef.current = false;
          inFlightPersistRef.current = null;
          const queuedDraft = queuedPersistRef.current;
          queuedPersistRef.current = null;
          if (queuedDraft && !areDraftsEqual(queuedDraft, lastSavedDraftRef.current)) {
            void persistDraft(queuedDraft);
          }
        });

      inFlightPersistRef.current = inFlight;
      return inFlight;
    },
    [
      applyPersistedVersion,
      clearAutosaveTimer,
      clearSaveFeedbackTimer,
      currentVersionNumberRef,
      currentVersionStateRef,
      params.itemId,
      params.workspaceId,
      publishedVersionNumber,
      readCurrentDraft,
      showSavedFeedback,
    ],
  );

  const scheduleAutosave = React.useCallback(() => {
    const autosaveStrategy = autosaveStrategyRef.current;
    if (!autosaveStrategy.enabled) return;
    if (isLoadingRef.current || errorRef.current || isPublishingRef.current) return;
    if (saveStateRef.current === "saving") return;

    const nextDraft = readCurrentDraft();
    if (areDraftsEqual(nextDraft, lastSavedDraftRef.current)) return;

    clearAutosaveTimer();
    autosaveTimerRef.current = window.setTimeout(() => {
      autosaveTimerRef.current = null;
      void persistDraft(nextDraft);
    }, autosaveStrategy.intervalSec * 1000);
  }, [
    autosaveStrategyRef,
    clearAutosaveTimer,
    errorRef,
    isLoadingRef,
    isPublishingRef,
    persistDraft,
    readCurrentDraft,
    saveStateRef,
  ]);

  React.useEffect(() => {
    let active = true;

    setIsLoading(true);
    setError(null);
    setSaveError(null);
    clearAutosaveTimer();
    clearSaveFeedbackTimer();
    setSaveState("hidden");

    void loadContentLibraryArticleEditorSnapshot(params.workspaceId, params.itemId)
      .then((snapshot) => {
        if (!active) return;
        const nextDraft = buildDraftFromVersion({
          item: snapshot.item,
          version: snapshot.draftVersion,
          initialTitle: params.initialTitle,
          initialSummary: params.initialSummary,
        });

        otherFieldsSnapshotRef.current = omitManagedFields(
          snapshot.draftVersion?.fieldsSnapshot ?? {},
        );
        otherPresentationsRef.current = omitManagedPresentations(
          snapshot.draftVersion?.presentations ?? [],
        );
        lastSavedDraftRef.current = cloneDraft(nextDraft);
        liveBodyDocumentRef.current = normalizeDocument(nextDraft.bodyDocument);
        setDraft(nextDraft);
        setCurrentVersionNumber(snapshot.draftVersion?.versionNumber ?? null);
        setCurrentVersionState(snapshot.draftVersion?.state ?? null);
        setPublishedVersionNumber(snapshot.publishedVersion?.versionNumber ?? null);
        setSaveState("hidden");
        setIsLoading(false);
      })
      .catch((nextError) => {
        if (!active) return;
        setError(nextError);
        setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    clearAutosaveTimer,
    clearSaveFeedbackTimer,
    params.initialSummary,
    params.initialTitle,
    params.itemId,
    params.workspaceId,
  ]);

  React.useEffect(() => {
    if (saveState === "saved" && !areDraftsEqual(readCurrentDraft(), lastSavedDraftRef.current)) {
      clearSaveFeedbackTimer();
      setSaveState("hidden");
    }
  }, [clearSaveFeedbackTimer, draft, readCurrentDraft, saveState]);

  React.useEffect(() => {
    if (isLoading || error) return;
    if (saveState === "saving" || isPublishing) return;
    if (areDraftsEqual(readCurrentDraft(), lastSavedDraftRef.current)) return;
    if (!contentStrategy.autosave.enabled) return;

    scheduleAutosave();

    return () => {
      clearAutosaveTimer();
    };
  }, [
    clearAutosaveTimer,
    contentStrategy.autosave.enabled,
    draft,
    error,
    isLoading,
    isPublishing,
    readCurrentDraft,
    saveState,
    scheduleAutosave,
  ]);

  React.useEffect(
    () => () => {
      clearAutosaveTimer();
      clearSaveFeedbackTimer();
    },
    [clearAutosaveTimer, clearSaveFeedbackTimer],
  );

  React.useEffect(() => {
    if (!contentStrategy.autosave.enabled || !contentStrategy.autosave.saveOnBlur) return;

    const flushDraft = () => {
      if (isLoading || error || isPublishing || saveState === "saving") return;
      if (areDraftsEqual(readCurrentDraft(), lastSavedDraftRef.current)) return;
      void persistDraft();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "hidden") return;
      flushDraft();
    };

    window.addEventListener("blur", flushDraft);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("blur", flushDraft);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    contentStrategy.autosave.enabled,
    contentStrategy.autosave.saveOnBlur,
    error,
    isLoading,
    isPublishing,
    persistDraft,
    readCurrentDraft,
    saveState,
  ]);

  const publish = React.useCallback(async () => {
    const nextDraft = cloneDraft({
      ...readCurrentDraft(),
      status: "published",
    });

    setDraft(nextDraft);
    setIsPublishing(true);

    try {
      const savedVersion = await persistDraft(nextDraft);
      const versionNumber = savedVersion?.versionNumber ?? currentVersionNumberRef.current;
      if (!versionNumber) return;

      const publishedVersion = await publishContentItemVersion(
        params.workspaceId,
        params.itemId,
        versionNumber,
      );

      applyPersistedVersion(publishedVersion, nextDraft, publishedVersion.versionNumber);
    } catch (nextError) {
      setSaveError(nextError);
      setSaveState("error");
      throw nextError;
    } finally {
      setIsPublishing(false);
    }
  }, [
    applyPersistedVersion,
    currentVersionNumberRef,
    params.itemId,
    params.workspaceId,
    persistDraft,
    readCurrentDraft,
  ]);

  return {
    isLoading,
    error,
    saveState,
    saveError,
    isPublishing,
    title: draft.title,
    setTitle: (value: string) => setDraft((current) => ({ ...current, title: value })),
    summary: draft.summary,
    setSummary: (value: string) => setDraft((current) => ({ ...current, summary: value })),
    slug: draft.slug,
    setSlug: (value: string) => setDraft((current) => ({ ...current, slug: value })),
    status: draft.status,
    visibility: draft.visibility,
    setVisibility: (value: AdminContentItemVisibility) =>
      setDraft((current) => ({ ...current, visibility: value })),
    coverAssetId: draft.coverAssetId,
    setCoverAssetId: (value: string) =>
      setDraft((current) => ({ ...current, coverAssetId: value })),
    seo: draft.seo,
    setSeo: (value: Partial<ContentLibraryArticleEditorSeoDraft>) =>
      setDraft((current) => ({
        ...current,
        seo: {
          ...current.seo,
          ...value,
          payload: value.payload === undefined ? current.seo.payload : value.payload,
        },
      })),
    bodyDocument: draft.bodyDocument,
    setBodyDocument: (value: Record<string, unknown>) => {
      liveBodyDocumentRef.current = normalizeDocument(value);
      if (
        saveStateRef.current === "saved" &&
        !areDraftsEqual(readCurrentDraft(), lastSavedDraftRef.current)
      ) {
        clearSaveFeedbackTimer();
        setSaveState("hidden");
      }
      scheduleAutosave();
    },
    draftVersionNumber: currentVersionNumber,
    draftVersionState: currentVersionState,
    publishedVersionNumber,
    hasUnsavedChanges: !areDraftsEqual(readCurrentDraft(), lastSavedDraftRef.current),
    autosaveStrategy: contentStrategy.autosave,
    publish,
  };
}
