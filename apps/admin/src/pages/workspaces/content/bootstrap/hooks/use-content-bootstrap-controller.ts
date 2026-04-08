import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { applyContentBootstrapShape, createContentItem, listAllContentModels } from "@/api/content";
import { useWorkspaceLocalization } from "@/hooks/use-workspace-localization";
import { DEFAULT_LOCALE, type AppLocale } from "@/lib/i18n";
import { notifyError } from "@/lib/notifications";
import {
  resolveContentItemContinuationRoute,
  workspaceContentLibraryPath,
  workspaceContentModelsPath,
} from "@/lib/routing/workspace-content-routing";
import type { AdminContentItem } from "@/types/api";
import { usePreferencesStore } from "@/stores/use-preference-store";

import { buildContentItemsQueryKey, buildContentModelsQueryKey } from "../../library/utils";
import { applyPresetSelection } from "../state";
import type { ContentBootstrapPresetKey } from "../types";

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

function useInvalidateContentItems(workspaceId: string) {
  const queryClient = useQueryClient();

  return React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: buildContentItemsQueryKey(workspaceId) });
  }, [queryClient, workspaceId]);
}

function buildStarterPresetPayload(presetKey: ContentBootstrapPresetKey) {
  const selection = applyPresetSelection(presetKey);
  return {
    presetKey: selection.presetKey,
    presetState: selection.presetState,
    capabilityPackIds: selection.capabilityPackIds,
  };
}

function useContinueWithStarterMutation(params: {
  workspaceId: string;
  title: string;
  locale: AppLocale;
  modelKey: string | null;
  presetKey: ContentBootstrapPresetKey | null;
  invalidateItems: () => Promise<void>;
  onSuccess: (item: AdminContentItem) => void;
}) {
  return useMutation({
    mutationFn: async () => {
      const nextTitle = params.title.trim();
      if (!nextTitle) throw new Error("CONTENT_BOOTSTRAP_TITLE_REQUIRED");
      const nextModelKey = params.modelKey?.trim();
      if (!nextModelKey) throw new Error("CONTENT_BOOTSTRAP_MODEL_REQUIRED");

      const draftItem = await createContentItem(params.workspaceId, {
        title: nextTitle,
        locale: params.locale,
        modelKey: nextModelKey,
      });
      if (params.presetKey) {
        const shapedItem = await applyContentBootstrapShape(
          params.workspaceId,
          draftItem.id,
          buildStarterPresetPayload(params.presetKey),
        );
        await params.invalidateItems();
        return shapedItem;
      }
      await params.invalidateItems();
      return draftItem;
    },
    onSuccess: (item) => {
      params.onSuccess(item);
    },
    onError: (error) => notifyError(error),
  });
}

function useStarterPresetSelection() {
  const [selectedPresetKey, setSelectedPresetKey] =
    React.useState<ContentBootstrapPresetKey | null>(null);
  const selectPreset = React.useCallback((presetKey: ContentBootstrapPresetKey | null) => {
    setSelectedPresetKey(presetKey);
  }, []);
  return { selectedPresetKey, selectPreset };
}

export function useContentBootstrapController(workspaceId: string) {
  const navigate = useNavigate();
  const locale = useBootstrapLocaleState();
  const invalidateItems = useInvalidateContentItems(workspaceId);
  const [title, setTitle] = React.useState("");
  const [selectedModelKey, setSelectedModelKey] = React.useState<string | null>(null);
  const { selectedPresetKey, selectPreset } = useStarterPresetSelection();
  const modelsQuery = useQuery({
    queryKey: buildContentModelsQueryKey(workspaceId),
    queryFn: () => listAllContentModels(workspaceId),
    enabled: Boolean(workspaceId),
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
    if (modelsQuery.data?.some((model) => model.key === selectedModelKey)) return;
    setSelectedModelKey(null);
  }, [modelsQuery.data, selectedModelKey]);

  const navigateToLibrary = React.useCallback(() => {
    void navigate({ to: workspaceContentLibraryPath(workspaceId) });
  }, [navigate, workspaceId]);

  const navigateToModels = React.useCallback(() => {
    void navigate({ to: workspaceContentModelsPath(workspaceId) });
  }, [navigate, workspaceId]);

  const navigateToContinuation = React.useCallback(
    (item: AdminContentItem) => {
      const route = resolveContentItemContinuationRoute(item);
      if (!route) {
        throw new Error("CONTENT_BOOTSTRAP_CONTINUATION_TARGET_MISSING");
      }
      void navigate({ to: route as never });
    },
    [navigate, workspaceId],
  );

  const continueMutation = useContinueWithStarterMutation({
    workspaceId,
    title,
    locale,
    modelKey: selectedModelKey,
    presetKey: selectedPresetKey,
    invalidateItems,
    onSuccess: navigateToContinuation,
  });

  return {
    availableModels: modelsQuery.data ?? [],
    hasAvailableModels: (modelsQuery.data?.length ?? 0) > 0,
    modelsLoading: modelsQuery.isLoading,
    modelsError,
    title,
    selectedModelKey,
    selectedPresetKey,
    busy: continueMutation.isPending,
    continuePending: continueMutation.isPending,
    canContinue: title.trim().length > 0 && Boolean(selectedModelKey),
    setTitle,
    selectModel: setSelectedModelKey,
    continueWithStarter: () => continueMutation.mutate(),
    navigateToLibrary,
    navigateToModels,
    selectPreset,
  };
}
