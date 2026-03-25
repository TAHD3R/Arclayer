import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { applyContentBootstrapShape, createContentItem } from "@/api/content";
import { useWorkspaceLocalization } from "@/hooks/use-workspace-localization";
import { DEFAULT_LOCALE, type AppLocale } from "@/lib/i18n";
import { notifyError } from "@/lib/notifications";
import {
  buildWorkspaceContentLibraryFocusSearch,
  workspaceContentLibraryPath,
} from "@/lib/routing/workspace-content-routing";
import { usePreferencesStore } from "@/stores/use-preference-store";

import { buildContentItemsQueryKey } from "../../library/utils";
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
  presetKey: ContentBootstrapPresetKey | null;
  invalidateItems: () => Promise<void>;
  onSuccess: (itemId: string) => void;
}) {
  return useMutation({
    mutationFn: async () => {
      const nextTitle = params.title.trim();
      if (!nextTitle) throw new Error("CONTENT_BOOTSTRAP_TITLE_REQUIRED");

      const draftItem = await createContentItem(params.workspaceId, {
        title: nextTitle,
        locale: params.locale,
      });
      if (params.presetKey) {
        await applyContentBootstrapShape(
          params.workspaceId,
          draftItem.id,
          buildStarterPresetPayload(params.presetKey),
        );
      }
      await params.invalidateItems();
      return draftItem;
    },
    onSuccess: (draftItem) => {
      params.onSuccess(draftItem.id);
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
  const { selectedPresetKey, selectPreset } = useStarterPresetSelection();

  const navigateToLibrary = React.useCallback(() => {
    void navigate({ to: workspaceContentLibraryPath(workspaceId) });
  }, [navigate, workspaceId]);

  const navigateToFocusedDraft = React.useCallback(
    (itemId: string) => {
      void navigate({
        to: workspaceContentLibraryPath(workspaceId),
        search: buildWorkspaceContentLibraryFocusSearch(itemId),
      });
    },
    [navigate, workspaceId],
  );

  const continueMutation = useContinueWithStarterMutation({
    workspaceId,
    title,
    locale,
    presetKey: selectedPresetKey,
    invalidateItems,
    onSuccess: navigateToFocusedDraft,
  });

  return {
    title,
    selectedPresetKey,
    busy: continueMutation.isPending,
    continuePending: continueMutation.isPending,
    canContinue: title.trim().length > 0,
    setTitle,
    continueWithStarter: () => continueMutation.mutate(),
    navigateToLibrary,
    selectPreset,
  };
}
