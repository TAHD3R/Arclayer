import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";

import { listAIModels, type AIModelCatalogItem } from "@/api/ai";
import { AIModelBrandIcon } from "@/components/ai/ai-model-brand-icons";
import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { useAssistantRuntime } from "@assistant-ui/react";

import {
  AUTO_AI_CHAT_MODEL,
  DEFAULT_AI_CHAT_MODEL,
  useAiChatStore,
} from "@/stores/use-ai-chat-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

type AIModelSelectorProps = {
  className?: string;
  compact?: boolean;
};

export function AIModelSelector({ className, compact = false }: AIModelSelectorProps) {
  const { t } = useTranslation(["ai", "common"]);
  const runtime = useAssistantRuntime({ optional: true });
  const [open, setOpen] = useState(false);
  const selectedModel = useAiChatStore((s) => s.selectedModel || DEFAULT_AI_CHAT_MODEL);
  const selectedReasoningEffort = useAiChatStore((s) => s.selectedReasoningEffort);
  const setSelectedModel = useAiChatStore((s) => s.setSelectedModel);
  const applyRuntimeDefaults = useAiChatStore((s) => s.applyRuntimeDefaults);
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId ?? s.lastWorkspaceId);
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
  const models = isModelCatalogSuccess
    ? modelCatalog.models.filter((model) => model.available)
    : [];
  const canShowSelectedModel = isModelCatalogSuccess && models.length > 0;
  const isAutoModel = selectedModel === AUTO_AI_CHAT_MODEL;
  const selected =
    canShowSelectedModel && !isAutoModel
      ? (models.find((model) => model.id === selectedModel) ?? models[0])
      : null;
  const triggerLabel =
    canShowSelectedModel && isAutoModel
      ? t("ai:AI_CHAT_MODEL_AUTO")
      : selected
        ? formatModelLabel(selected, t)
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
          modelName: isAutoModel ? undefined : selectedModel,
          reasoningEffort: selectedReasoningEffort,
        },
      }),
    });
  }, [isAutoModel, runtime, selectedModel, selectedReasoningEffort]);

  useEffect(() => {
    const catalog = modelCatalog;
    if (!catalog) return;
    if (models.length === 0) {
      if (selectedModel !== AUTO_AI_CHAT_MODEL) {
        setSelectedModel(AUTO_AI_CHAT_MODEL, "default");
      }
      return;
    }
    const defaultModel = models.some((model) => model.id === catalog.defaultModel)
      ? catalog.defaultModel
      : models[0].id;
    if (selectedModel === AUTO_AI_CHAT_MODEL) return;
    if (!models.some((model) => model.id === selectedModel)) {
      setSelectedModel(defaultModel, "default");
      return;
    }
    applyRuntimeDefaults({
      model: defaultModel,
      reasoningEffort: catalog.reasoningEffort,
      composerMode: catalog.defaultMode,
    });
  }, [applyRuntimeDefaults, modelCatalog, models, selectedModel, setSelectedModel]);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={t("ai:AI_CHAT_MODEL_SELECT")}
          aria-expanded={open}
          className={cn(
            "h-8 min-w-0 justify-start gap-2 rounded-md px-2.5 text-footnote font-semibold text-label-primary shadow-none hover:bg-accent/70",
            compact ? "max-w-[10.25rem]" : "max-w-[15rem]",
            className,
          )}
        >
          {isAutoModel ? (
            <AIModelBrandIcon auto />
          ) : selected ? (
            <AIModelBrandIcon provider={selected.provider} modelId={selected.id} />
          ) : null}
          <span className={cn("truncate", !selected && "text-label-secondary")}>
            {triggerLabel}
          </span>
          <ChevronDownIcon className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className={cn(
          "max-h-80 overflow-y-auto",
          compact ? "w-[23rem] max-w-[calc(100vw-2rem)]" : "w-[min(24rem,calc(100vw-2rem))]",
        )}
      >
        <DropdownMenuGroup className="w-full">
          {models.length > 0 ? (
            <DropdownMenuItem
              onSelect={() => {
                setSelectedModel(AUTO_AI_CHAT_MODEL);
                setOpen(false);
              }}
              className="cursor-pointer items-start gap-3"
            >
              <AIModelBrandIcon auto className="mt-0.5 size-5" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-callout font-semibold text-label-primary">
                  {t("ai:AI_CHAT_MODEL_AUTO")}
                </span>
                <span className="mt-0.5 block truncate text-footnote text-label-secondary">
                  {t("ai:AI_CHAT_MODEL_AUTO_DESC")}
                </span>
              </span>
              <CheckIcon
                className={cn(
                  "mt-1 size-4 text-label-secondary",
                  isAutoModel ? "opacity-100" : "opacity-0",
                )}
                aria-hidden="true"
              />
            </DropdownMenuItem>
          ) : null}
          {models.map((model) => {
            const active = selected?.id === model.id;
            return (
              <DropdownMenuItem
                key={model.id}
                onSelect={() => {
                  setSelectedModel(model.id);
                  setOpen(false);
                }}
                className="cursor-pointer items-start gap-3"
              >
                <AIModelBrandIcon
                  provider={model.provider}
                  modelId={model.id}
                  className="mt-0.5 size-5"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-callout font-semibold text-label-primary">
                    {formatModelLabel(model, t)}
                  </span>
                  <span className="mt-0.5 block truncate text-footnote text-label-secondary">
                    {formatModelDescription(model, t)}
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

function formatModelLabel(model: AIModelCatalogItem, t: (key: string) => string): string {
  return model.labelKey ? t(model.labelKey) : model.label;
}

function formatModelDescription(model: AIModelCatalogItem, t: (key: string) => string): string {
  if (model.descriptionKey) return t(model.descriptionKey);
  return model.description ?? model.id;
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
