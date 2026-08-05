import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";

import { listAIModels, type AIModelCatalogItem } from "@/api/ai";
import { AIModelBrandIcon } from "@/components/ai/ai-model-brand-icons";
import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";
import { Switch } from "@arclayer/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { useAssistantRuntime } from "@assistant-ui/react";

import { AUTO_AI_CHAT_MODEL, useAiChatStore } from "@/stores/use-ai-chat-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

type AIModelSelectorProps = {
  className?: string;
  compact?: boolean;
  iconOnly?: boolean;
};

export function AIModelSelector({
  className,
  compact = false,
  iconOnly = false,
}: AIModelSelectorProps) {
  const { t, i18n } = useTranslation(["ai", "common"]);
  const runtime = useAssistantRuntime({ optional: true });
  const [open, setOpen] = useState(false);
  const selectedModel = useAiChatStore((s) => s.selectedModel);
  const selectedModelSource = useAiChatStore((s) => s.selectedModelSource);
  const selectedReasoningEffort = useAiChatStore((s) => s.selectedReasoningEffort);
  const setSelectedModel = useAiChatStore((s) => s.setSelectedModel);
  const applyRuntimeDefaults = useAiChatStore((s) => s.applyRuntimeDefaults);
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const {
    data: modelCatalog,
    isError: isModelCatalogError,
    isLoading: isModelCatalogLoading,
    isSuccess: isModelCatalogSuccess,
  } = useQuery({
    queryKey: ["ai", "chat-models", workspaceId],
    queryFn: ({ signal }) => listAIModels({ workspaceId: String(workspaceId), signal }),
    enabled: Boolean(workspaceId),
    refetchOnMount: "always",
    staleTime: 0,
    retry: false,
  });
  const models = useMemo(
    () => (isModelCatalogSuccess ? modelCatalog.models.filter((model) => model.available) : []),
    [isModelCatalogSuccess, modelCatalog],
  );
  const canShowSelectedModel = isModelCatalogSuccess && models.length > 0;
  const isAutoModel = selectedModel === AUTO_AI_CHAT_MODEL;
  const defaultModel = models.find((model) => model.id === modelCatalog?.defaultModel)?.id;
  const productLocale = modelProductLocale(i18n.resolvedLanguage ?? i18n.language);
  const selected =
    canShowSelectedModel && !isAutoModel
      ? (models.find((model) => model.id === selectedModel) ?? null)
      : null;
  const triggerLabel =
    canShowSelectedModel && isAutoModel
      ? t("ai:AI_CHAT_MODEL_AUTO")
      : selected
        ? formatModelLabel(selected, productLocale)
        : canShowSelectedModel
          ? t("ai:AI_CHAT_MODEL_SELECT")
          : getModelSelectorStatusLabel({
              hasWorkspace: Boolean(workspaceId),
              isLoading: isModelCatalogLoading,
              isError: isModelCatalogError,
              t,
            });

  useEffect(() => {
    if (!runtime) return undefined;

    return runtime.registerModelContextProvider({
      getModelContext: () => ({
        config: {
          modelName: selected?.id,
          reasoningEffort: selectedReasoningEffort,
        },
      }),
    });
  }, [runtime, selected, selectedReasoningEffort]);

  useEffect(() => {
    const catalog = modelCatalog;
    if (!catalog) return;
    const runtimeDefaults = {
      reasoningEffort: catalog.reasoningEffort,
      composerMode: catalog.defaultMode,
    };
    if (models.length === 0) {
      applyRuntimeDefaults(runtimeDefaults);
      if (selectedModel !== AUTO_AI_CHAT_MODEL) {
        setSelectedModel(AUTO_AI_CHAT_MODEL, "default");
      }
      return;
    }
    const defaultCatalogModel = models.find((model) => model.id === catalog.defaultModel)?.id;
    applyRuntimeDefaults({
      ...runtimeDefaults,
      model: defaultCatalogModel,
    });
    if (selectedModel === AUTO_AI_CHAT_MODEL) return;
    if (!models.some((model) => model.id === selectedModel)) {
      setSelectedModel(defaultCatalogModel ?? AUTO_AI_CHAT_MODEL, "default");
      return;
    }
    if (!defaultCatalogModel && selectedModelSource === "default") {
      setSelectedModel(AUTO_AI_CHAT_MODEL, "default");
    }
  }, [
    applyRuntimeDefaults,
    modelCatalog,
    models,
    selectedModel,
    selectedModelSource,
    setSelectedModel,
  ]);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={iconOnly ? "icon-sm" : "sm"}
          aria-label={t("ai:AI_CHAT_MODEL_SELECT")}
          aria-expanded={open}
          title={iconOnly ? triggerLabel : undefined}
          className={cn(
            "h-8 min-w-0 justify-start gap-2 rounded-md px-2.5 text-footnote font-semibold text-label-primary shadow-none hover:bg-accent/70",
            iconOnly
              ? "w-8 justify-center gap-0 px-0"
              : compact
                ? "max-w-[10.25rem]"
                : "max-w-[15rem]",
            className,
          )}
        >
          {isAutoModel ? (
            <AIModelBrandIcon auto />
          ) : selected ? (
            <AIModelBrandIcon
              provider={selected.provider}
              modelId={selected.id}
              providerIcon={selected.providerIcon}
            />
          ) : iconOnly ? (
            <AIModelBrandIcon modelId={selectedModel} />
          ) : null}
          {iconOnly ? null : (
            <>
              <span className={cn("truncate", !selected && "text-label-secondary")}>
                {triggerLabel}
              </span>
              <ChevronDownIcon className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className={cn(
          "max-h-80 overflow-y-auto",
          compact ? "w-[23rem] max-w-[calc(100vw-2rem)]" : "w-[min(24rem,calc(100vw-2rem))]",
        )}
      >
        <div className="flex min-h-11 items-center justify-between gap-4 border-b border-border/60 px-3 py-2">
          <span className="text-callout font-semibold text-label-primary">
            {t("ai:AI_CHAT_MODEL_GROUP")}
          </span>
          <label className="flex cursor-pointer items-center gap-2 text-footnote font-medium text-label-secondary">
            <span>{t("ai:AI_CHAT_MODEL_AUTO")}</span>
            <Switch
              checked={isAutoModel}
              aria-label={t("ai:AI_CHAT_MODEL_AUTO")}
              disabled={!defaultModel}
              onCheckedChange={(checked) => {
                setSelectedModel(checked ? AUTO_AI_CHAT_MODEL : String(defaultModel));
              }}
            />
          </label>
        </div>
        <DropdownMenuGroup className="w-full">
          {models.map((model) => {
            const active = selected?.id === model.id;
            return (
              <DropdownMenuItem
                key={model.id}
                disabled={isAutoModel && Boolean(defaultModel)}
                onSelect={() => {
                  setSelectedModel(model.id);
                  setOpen(false);
                }}
                className="cursor-pointer items-start gap-3 data-disabled:cursor-not-allowed data-disabled:opacity-45"
              >
                <AIModelBrandIcon
                  provider={model.provider}
                  modelId={model.id}
                  providerIcon={model.providerIcon}
                  className="mt-0.5 size-5"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-callout font-semibold text-label-primary">
                    {formatModelLabel(model, productLocale)}
                  </span>
                  <span className="mt-0.5 block truncate text-footnote text-label-secondary">
                    {formatModelDescription(model, productLocale, t)}
                  </span>
                </span>
                <CheckIcon
                  className={cn(
                    "mt-1 size-4 text-label-secondary",
                    active ? "opacity-100" : "opacity-0",
                  )}
                  aria-hidden="true"
                />
              </DropdownMenuItem>
            );
          })}
          {isModelCatalogLoading ? (
            <div className="px-3 py-3 text-footnote text-label-secondary">
              {t("ai:AI_CHAT_MODEL_LOADING")}
            </div>
          ) : null}
          {!workspaceId ? (
            <div className="px-3 py-3 text-footnote text-label-secondary">
              {t("ai:AI_CHAT_MODEL_WORKSPACE_REQUIRED")}
            </div>
          ) : null}
          {isModelCatalogError ? (
            <div className="px-3 py-3 text-footnote text-destructive">
              {t("ai:AI_CHAT_MODEL_LOAD_FAILED")}
            </div>
          ) : null}
          {isModelCatalogSuccess && models.length === 0 ? (
            <div className="px-3 py-3 text-footnote text-label-secondary">
              {t("ai:AI_CHAT_MODEL_EMPTY")}
            </div>
          ) : null}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type ModelProductLocale = "zh-CN" | "en-US";

function modelProductLocale(language: string): ModelProductLocale {
  return language.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
}

function formatModelLabel(model: AIModelCatalogItem, locale: ModelProductLocale): string {
  return model.labelI18n?.[locale]?.trim() || model.label;
}

function formatModelDescription(
  model: AIModelCatalogItem,
  locale: ModelProductLocale,
  t: (key: string) => string,
): string {
  return (
    model.descriptionI18n?.[locale]?.trim() ||
    model.description?.trim() ||
    t("ai:AI_CHAT_MODEL_DESCRIPTION_UNAVAILABLE")
  );
}

function getModelSelectorStatusLabel(options: {
  hasWorkspace: boolean;
  isLoading: boolean;
  isError: boolean;
  t: (key: string) => string;
}): string {
  if (!options.hasWorkspace) return options.t("ai:AI_CHAT_MODEL_WORKSPACE_REQUIRED");
  if (options.isLoading) return options.t("ai:AI_CHAT_MODEL_LOADING");
  if (options.isError) return options.t("ai:AI_CHAT_MODEL_LOAD_FAILED");
  return options.t("ai:AI_CHAT_MODEL_EMPTY");
}
