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
  DEFAULT_AI_REASONING_EFFORT,
  useAiChatStore,
  type AIReasoningEffort,
} from "@/stores/use-ai-chat-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

const AI_REASONING_EFFORTS: readonly AIReasoningEffort[] = ["low", "medium", "high"];

type AIModelSelectorProps = {
  className?: string;
  compact?: boolean;
};

export function AIModelSelector({ className, compact = false }: AIModelSelectorProps) {
  const { t } = useTranslation(["ai", "common"]);
  const runtime = useAssistantRuntime({ optional: true });
  const [open, setOpen] = useState(false);
  const selectedModel = useAiChatStore((s) => s.selectedModel || DEFAULT_AI_CHAT_MODEL);
  const selectedReasoningEffort = useAiChatStore(
    (s) => s.selectedReasoningEffort || DEFAULT_AI_REASONING_EFFORT,
  );
  const setSelectedModel = useAiChatStore((s) => s.setSelectedModel);
  const setSelectedReasoningEffort = useAiChatStore((s) => s.setSelectedReasoningEffort);
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
    staleTime: 60_000,
    retry: false,
  });
  const models = modelCatalog?.models ?? [];
  const canShowSelectedModel = isModelCatalogSuccess && models.length > 0;
  const isAutoModel = selectedModel === AUTO_AI_CHAT_MODEL;
  const selected =
    canShowSelectedModel && !isAutoModel
      ? (models.find((model) => model.id === selectedModel) ?? models[0])
      : null;
  const triggerLabel = isAutoModel
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
    if (selectedModel === AUTO_AI_CHAT_MODEL) return;
    if (!models.some((model) => model.id === selectedModel)) {
      setSelectedModel(catalog.defaultModel, "default");
      return;
    }
    applyRuntimeDefaults({
      model: catalog.defaultModel,
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
            "h-8 min-w-0 justify-start gap-2 rounded-2xl px-2.5 text-footnote font-semibold text-label-primary shadow-none hover:bg-accent/70",
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
          <span
            className={cn(
              "hidden shrink-0 font-medium text-label-secondary sm:inline",
              compact && "sm:hidden",
            )}
          >
            {t(`ai:AI_CHAT_REASONING_${selectedReasoningEffort.toUpperCase()}`)}
          </span>
          <ChevronDownIcon className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className={cn(
          "overflow-hidden rounded-2xl p-0",
          compact ? "w-[23rem] max-w-[calc(100vw-2rem)]" : "w-[min(24rem,calc(100vw-2rem))]",
        )}
      >
        <div className="box-border max-h-80 w-full overflow-y-auto px-2 py-2">
          <DropdownMenuGroup className="w-full">
            <DropdownMenuItem
              onSelect={() => {
                setSelectedModel(AUTO_AI_CHAT_MODEL);
                setOpen(false);
              }}
              className="box-border w-full cursor-pointer items-start gap-3 rounded-xl px-3 py-3"
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
            {models.map((model) => {
              const active = selected?.id === model.id;
              return (
                <DropdownMenuItem
                  key={model.id}
                  onSelect={() => {
                    setSelectedModel(model.id);
                    setOpen(false);
                  }}
                  className="box-border w-full cursor-pointer items-start gap-3 rounded-xl px-3 py-3"
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
        </div>
        <div className="flex items-center gap-2 border-t border-border/70 p-2">
          <span className="px-1 text-caption font-semibold text-label-secondary">
            {t("ai:AI_CHAT_REASONING_LABEL")}
          </span>
          <div className="ml-auto grid grid-cols-3 rounded-lg bg-muted p-0.5">
            {AI_REASONING_EFFORTS.map((effort) => (
              <button
                key={effort}
                type="button"
                onClick={() => setSelectedReasoningEffort(effort)}
                className={cn(
                  "h-6 min-w-8 rounded-md px-2.5 text-caption text-label-secondary transition-colors",
                  selectedReasoningEffort === effort && "bg-background text-label-primary",
                )}
              >
                {t(`ai:AI_CHAT_REASONING_${effort.toUpperCase()}`)}
              </button>
            ))}
          </div>
        </div>
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
