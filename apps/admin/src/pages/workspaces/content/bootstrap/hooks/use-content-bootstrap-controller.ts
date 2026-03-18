import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { applyContentBootstrapShape, createContentItem } from "@/api/content";
import { getWorkspaceSite, issueWorkspaceSitePreviewToken } from "@/api/workspace-site";
import { useWorkspaceLocalization } from "@/hooks/use-workspace-localization";
import { DEFAULT_LOCALE, type AppLocale } from "@/lib/i18n";
import { notifyError } from "@/lib/notifications";
import {
  buildWorkspaceContentEditorUrl,
  workspaceContentLibraryPath,
} from "@/lib/routing/workspace-content-routing";
import { buildLocaleOptions } from "@/lib/settings/general/localization-options";
import { usePreferencesStore } from "@/stores/use-preference-store";
import type { AdminContentItem } from "@/types/api";

import { buildContentItemsQueryKey } from "../../library/utils";
import { CONTENT_BOOTSTRAP_CAPABILITY_PACKS } from "../definitions";
import {
  applyPresetSelection,
  createEmptyShapeSelection,
  detachPreset,
  toggleCapabilityPack,
} from "../state";
import type { ContentBootstrapPresetKey, ContentBootstrapShapeSelection } from "../types";

const PREVIEW_TOKEN_TTL_SECONDS = 600;

function resolveDefaultLocale(params: {
  preferenceLocale: AppLocale;
  workspaceLocale?: AppLocale;
}) {
  return params.workspaceLocale ?? params.preferenceLocale ?? DEFAULT_LOCALE;
}

function useBootstrapLocaleState() {
  const { t } = useTranslation("content");
  const preferenceLocale = usePreferencesStore((state) => state.locale);
  const workspaceLocalization = useWorkspaceLocalization();
  const workspaceLocale = workspaceLocalization.localization.locale;
  const localeOptions = React.useMemo(() => buildLocaleOptions(t), [t]);
  const [locale, setLocale] = React.useState<AppLocale>(() =>
    resolveDefaultLocale({ preferenceLocale, workspaceLocale }),
  );

  React.useEffect(() => {
    setLocale(resolveDefaultLocale({ preferenceLocale, workspaceLocale }));
  }, [preferenceLocale, workspaceLocale]);

  return { locale, localeOptions, setLocale };
}

function useInvalidateContentItems(workspaceId: string) {
  const queryClient = useQueryClient();

  return React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: buildContentItemsQueryKey(workspaceId) });
  }, [queryClient, workspaceId]);
}

function useCreateDraftMutation(params: {
  workspaceId: string;
  title: string;
  locale: AppLocale;
  invalidateItems: () => Promise<void>;
  onDraftCreated: (item: AdminContentItem) => void;
}) {
  return useMutation({
    mutationFn: async () => {
      const nextTitle = params.title.trim();
      if (!nextTitle) throw new Error("CONTENT_BOOTSTRAP_TITLE_REQUIRED");
      return createContentItem(params.workspaceId, { title: nextTitle, locale: params.locale });
    },
    onSuccess: async (item) => {
      params.onDraftCreated(item);
      await params.invalidateItems();
    },
    onError: (error) => notifyError(error),
  });
}

function useContinueToEditorMutation(params: {
  workspaceId: string;
  draftItem: AdminContentItem | null;
  shapeSelection: ContentBootstrapShapeSelection;
  invalidateItems: () => Promise<void>;
}) {
  return useMutation({
    mutationFn: async () => {
      if (!params.draftItem) throw new Error("CONTENT_BOOTSTRAP_DRAFT_REQUIRED");
      const shaped = await applyContentBootstrapShape(params.workspaceId, params.draftItem.id, {
        presetKey: params.shapeSelection.presetKey,
        presetState: params.shapeSelection.presetState,
        capabilityPackIds: params.shapeSelection.capabilityPackIds,
      });
      const [site, previewToken] = await Promise.all([
        getWorkspaceSite(params.workspaceId),
        issueWorkspaceSitePreviewToken(params.workspaceId, {
          ttlSeconds: PREVIEW_TOKEN_TTL_SECONDS,
        }),
      ]);
      await params.invalidateItems();
      return buildWorkspaceContentEditorUrl({
        siteId: site.siteId,
        itemId: shaped.id,
        token: previewToken.token,
        returnTo: workspaceContentLibraryPath(params.workspaceId),
      });
    },
    onSuccess: (editorUrl) => {
      window.location.replace(editorUrl);
    },
    onError: (error) => notifyError(error),
  });
}

function useShapeSelectionActions() {
  const [shapeSelection, setShapeSelection] = React.useState<ContentBootstrapShapeSelection>(
    createEmptyShapeSelection(),
  );

  const selectPreset = React.useCallback((presetKey: ContentBootstrapPresetKey) => {
    setShapeSelection(applyPresetSelection(presetKey));
  }, []);

  const togglePack = React.useCallback(
    (packId: (typeof CONTENT_BOOTSTRAP_CAPABILITY_PACKS)[number]["id"]) => {
      setShapeSelection((current) => toggleCapabilityPack(current, packId));
    },
    [],
  );

  const clearPreset = React.useCallback(() => {
    setShapeSelection((current) => detachPreset(current));
  }, []);

  return { shapeSelection, setShapeSelection, selectPreset, togglePack, clearPreset };
}

export function useContentBootstrapController(workspaceId: string) {
  const navigate = useNavigate();
  const { locale, localeOptions, setLocale } = useBootstrapLocaleState();
  const invalidateItems = useInvalidateContentItems(workspaceId);
  const [title, setTitle] = React.useState("");
  const [draftItem, setDraftItem] = React.useState<AdminContentItem | null>(null);
  const { shapeSelection, setShapeSelection, selectPreset, togglePack, clearPreset } =
    useShapeSelectionActions();
  const createDraftMutation = useCreateDraftMutation({
    workspaceId,
    title,
    locale,
    invalidateItems,
    onDraftCreated: (item) => {
      setDraftItem(item);
      setShapeSelection(createEmptyShapeSelection());
    },
  });
  const continueMutation = useContinueToEditorMutation({
    workspaceId,
    draftItem,
    shapeSelection,
    invalidateItems,
  });

  const navigateToLibrary = React.useCallback(() => {
    void navigate({ to: workspaceContentLibraryPath(workspaceId) });
  }, [navigate, workspaceId]);

  return {
    locale,
    localeOptions,
    title,
    draftItem,
    shapeSelection,
    draftCreated: Boolean(draftItem),
    busy: createDraftMutation.isPending || continueMutation.isPending,
    createDraftPending: createDraftMutation.isPending,
    continuePending: continueMutation.isPending,
    canCreateDraft: title.trim().length > 0,
    hasPresetSelection: Boolean(shapeSelection.presetKey),
    setTitle,
    setLocale,
    createDraft: () => createDraftMutation.mutate(),
    continueToEditor: () => continueMutation.mutate(),
    detachPreset: clearPreset,
    navigateToLibrary,
    selectPreset,
    toggleCapabilityPack: togglePack,
  };
}
