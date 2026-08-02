import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import {
  createContentItem,
  listAllContentModels,
  saveContentItemDraftVersion,
} from "@/api/content";
import { useWorkspaceLocalization } from "@/hooks/use-workspace-localization";
import { DEFAULT_LOCALE, type AppLocale } from "@/lib/i18n";
import { notifyError } from "@/lib/notifications";
import {
  buildProjectContentLibraryFocusSearch,
  projectContentLibraryPath,
  projectContentModelsPath,
} from "@/lib/routing/project-content-routing";
import { usePreferencesStore } from "@/stores/use-preference-store";
import type { ContentItemOut, JsonValueInput } from "@arclayer/openapi";

type AdminContentItemVisibility = ContentItemOut["visibility"];
type AdminContentItem = Awaited<ReturnType<typeof createContentItem>>;
type AdminContentModel = Awaited<ReturnType<typeof listAllContentModels>>[number];

import { buildContentItemsQueryKey, buildContentModelsQueryKey } from "../../library/utils";
import { resolveContentBootstrapVariant } from "../../content-type-presentation";

type ContentBootstrapSeoDraft = {
  metaTitle: string;
  metaDescription: string;
};

function slugifyContentValue(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  return trimmed
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/g, "")
    .replace(/-+$/g, "");
}

function buildInitialDraftPayload(params: {
  item: Pick<AdminContentItem, "draftVersion" | "slug">;
  model: AdminContentModel;
  title: string;
  summary: string;
  slug: string;
  visibility: AdminContentItemVisibility;
  seo: ContentBootstrapSeoDraft;
}) {
  const variant = resolveContentBootstrapVariant(params.model);
  const normalizedSlug = params.slug.trim() || params.item.slug;
  const metaTitle = params.seo.metaTitle.trim();
  const metaDescription = params.seo.metaDescription.trim();
  const seoPayload: Record<string, JsonValueInput> = {};

  if (variant === "page" && metaTitle) seoPayload.metaTitle = metaTitle;
  if (variant === "page" && metaDescription) seoPayload.metaDescription = metaDescription;

  return {
    expectedVersion: params.item.draftVersion,
    changeSummary: "Seed content draft settings",
    fieldsSnapshot: {
      title: params.title.trim(),
      summary: params.summary.trim(),
      slug: normalizedSlug,
      visibility: params.visibility,
    },
    presentations:
      Object.keys(seoPayload).length > 0 ? [{ kind: "seo" as const, payload: seoPayload }] : [],
  };
}

function resolveDefaultLocale(params: {
  preferenceLocale: AppLocale;
  workspaceLocale?: AppLocale;
}) {
  return params.workspaceLocale ?? params.preferenceLocale ?? DEFAULT_LOCALE;
}

function useBootstrapLocaleState() {
  const preferenceLocale = usePreferencesStore((state) => state.locale);
  const workspaceLocalization = useWorkspaceLocalization();
  const workspaceLocale = workspaceLocalization.localization.locale;
  const [locale, setLocale] = React.useState<AppLocale>(() =>
    resolveDefaultLocale({ preferenceLocale, workspaceLocale }),
  );

  React.useEffect(() => {
    setLocale(resolveDefaultLocale({ preferenceLocale, workspaceLocale }));
  }, [preferenceLocale, workspaceLocale]);

  return locale;
}

function useInvalidateContentItems(projectId: string) {
  const queryClient = useQueryClient();

  return React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: buildContentItemsQueryKey(projectId) });
  }, [queryClient, projectId]);
}

function useCreateDraftMutation(params: {
  projectId: string;
  title: string;
  summary: string;
  slug: string;
  visibility: AdminContentItemVisibility;
  seo: ContentBootstrapSeoDraft;
  locale: AppLocale;
  model: AdminContentModel | null;
  invalidateItems: () => Promise<void>;
  onSuccess: (item: AdminContentItem) => void;
}) {
  return useMutation({
    mutationFn: async () => {
      const nextTitle = params.title.trim();
      if (!nextTitle) throw new Error("CONTENT_BOOTSTRAP_TITLE_REQUIRED");
      const nextModelKey = params.model?.singularKey.trim();
      if (!nextModelKey || !params.model) throw new Error("CONTENT_BOOTSTRAP_MODEL_REQUIRED");

      let draftItem: AdminContentItem | null = null;
      try {
        draftItem = await createContentItem(params.projectId, {
          title: nextTitle,
          locale: params.locale,
          modelKey: nextModelKey,
        });

        await saveContentItemDraftVersion(
          params.projectId,
          draftItem.id,
          buildInitialDraftPayload({
            item: draftItem,
            model: params.model,
            title: nextTitle,
            summary: params.summary,
            slug: params.slug,
            visibility: params.visibility,
            seo: params.seo,
          }),
        );

        await params.invalidateItems();
        return draftItem;
      } catch (error) {
        if (draftItem) {
          await params.invalidateItems();
        }
        throw error;
      }
    },
    onSuccess: (item) => {
      params.onSuccess(item);
    },
    onError: (error) => notifyError(error),
  });
}

export function useContentBootstrapController(projectId: string) {
  const navigate = useNavigate();
  const locale = useBootstrapLocaleState();
  const invalidateItems = useInvalidateContentItems(projectId);
  const [title, setTitle] = React.useState("");
  const [summary, setSummary] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const slugEditedRef = React.useRef(false);
  const [visibility, setVisibility] = React.useState<AdminContentItemVisibility>("public");
  const [seo, setSeo] = React.useState<ContentBootstrapSeoDraft>({
    metaTitle: "",
    metaDescription: "",
  });
  const [selectedModelKey, setSelectedModelKey] = React.useState<string | null>(null);
  const modelsQuery = useQuery({
    queryKey: buildContentModelsQueryKey(projectId),
    queryFn: () => listAllContentModels(projectId),
    enabled: Boolean(projectId),
    staleTime: 60_000,
  });
  const modelsError = React.useMemo(() => {
    if (!modelsQuery.error) return null;
    return modelsQuery.error instanceof Error
      ? modelsQuery.error
      : new Error("CONTENT_BOOTSTRAP_MODEL_LOAD_FAILED");
  }, [modelsQuery.error]);

  React.useEffect(() => {
    if (!selectedModelKey) return;
    if (modelsQuery.data?.some((model) => model.singularKey === selectedModelKey)) return;
    setSelectedModelKey(null);
  }, [modelsQuery.data, selectedModelKey]);

  const selectedModel = React.useMemo(
    () => modelsQuery.data?.find((model) => model.singularKey === selectedModelKey) ?? null,
    [modelsQuery.data, selectedModelKey],
  );

  const setTitleAndMaybeSlug = React.useCallback((value: string) => {
    setTitle(value);
    if (!slugEditedRef.current) {
      setSlug(slugifyContentValue(value));
    }
  }, []);

  const setSlugValue = React.useCallback((value: string) => {
    setSlug(value);
    slugEditedRef.current = true;
  }, []);

  const navigateToLibrary = React.useCallback(() => {
    void navigate({ to: projectContentLibraryPath(projectId) });
  }, [navigate, projectId]);

  const navigateToModels = React.useCallback(() => {
    void navigate({ to: projectContentModelsPath(projectId) });
  }, [navigate, projectId]);

  const navigateToContinuation = React.useCallback(
    (item: AdminContentItem) => {
      void navigate({
        to: projectContentLibraryPath(projectId),
        search: buildProjectContentLibraryFocusSearch(item.id),
      });
    },
    [navigate, projectId],
  );

  const createDraftMutation = useCreateDraftMutation({
    projectId,
    title,
    summary,
    slug,
    visibility,
    seo,
    locale,
    model: selectedModel,
    invalidateItems,
    onSuccess: navigateToContinuation,
  });

  return {
    availableModels: modelsQuery.data ?? [],
    hasAvailableModels: (modelsQuery.data?.length ?? 0) > 0,
    modelsLoading: modelsQuery.isLoading,
    modelsError,
    title,
    summary,
    slug,
    visibility,
    seo,
    selectedModel,
    selectedModelKey,
    busy: createDraftMutation.isPending,
    createPending: createDraftMutation.isPending,
    canCreate: title.trim().length > 0 && Boolean(selectedModelKey),
    setTitle: setTitleAndMaybeSlug,
    setSummary,
    setSlug: setSlugValue,
    setVisibility,
    setSeoMetaTitle: (value: string) => setSeo((current) => ({ ...current, metaTitle: value })),
    setSeoMetaDescription: (value: string) =>
      setSeo((current) => ({ ...current, metaDescription: value })),
    selectModel: setSelectedModelKey,
    createDraft: () => createDraftMutation.mutate(),
    navigateToLibrary,
    navigateToModels,
  };
}
