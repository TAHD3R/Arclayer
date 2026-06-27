import { CheckIcon, ChevronDownIcon, SparklesIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";

import { listAIModels, type AIModelCatalogItem } from "@/api/ai";
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
  const modelsQuery = useQuery({
    queryKey: ["ai", "chat-models", workspaceId],
    queryFn: ({ signal }) => listAIModels({ workspaceId: String(workspaceId), signal }),
    enabled: Boolean(workspaceId),
    staleTime: 60_000,
    retry: false,
  });
  const models = modelsQuery.data?.models ?? [];
  const canShowSelectedModel = modelsQuery.isSuccess && models.length > 0;
  const selected = canShowSelectedModel
    ? (models.find((model) => model.id === selectedModel) ?? models[0])
    : null;
  const triggerLabel = selected
    ? formatModelLabel(selected, t)
    : getModelSelectorStatusLabel({
        hasWorkspace: Boolean(workspaceId),
        isLoading: modelsQuery.isLoading,
        isError: modelsQuery.isError,
        t,
      });

  useEffect(() => {
    if (!runtime) return undefined;

    return runtime.registerModelContextProvider({
      getModelContext: () => ({
        config: {
          modelName: selectedModel,
          reasoningEffort: selectedReasoningEffort,
        },
      }),
    });
  }, [runtime, selectedModel, selectedReasoningEffort]);

  useEffect(() => {
    const catalog = modelsQuery.data;
    if (!catalog) return;
    if (!models.some((model) => model.id === selectedModel)) {
      setSelectedModel(catalog.defaultModel, "default");
      return;
    }
    applyRuntimeDefaults({
      model: catalog.defaultModel,
      reasoningEffort: catalog.reasoningEffort,
      composerMode: catalog.defaultMode,
    });
  }, [applyRuntimeDefaults, models, modelsQuery.data, selectedModel, setSelectedModel]);

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
          {selected ? <ModelProviderIcon provider={selected.provider} /> : null}
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
                  <ModelProviderIcon provider={model.provider} className="mt-0.5 size-5" />
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
            {modelsQuery.isLoading ? (
              <div className="px-3 py-3 text-footnote text-label-secondary">
                {t("ai:AI_CHAT_MODEL_LOADING")}
              </div>
            ) : null}
            {!workspaceId ? (
              <div className="px-3 py-3 text-footnote text-label-secondary">
                {t("ai:AI_CHAT_MODEL_WORKSPACE_REQUIRED")}
              </div>
            ) : null}
            {modelsQuery.isError ? (
              <div className="px-3 py-3 text-footnote text-destructive">
                {t("ai:AI_CHAT_MODEL_LOAD_FAILED")}
              </div>
            ) : null}
            {modelsQuery.isSuccess && models.length === 0 ? (
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

function ModelProviderIcon({ provider, className }: { provider: string; className?: string }) {
  return (
    <span
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-full text-label-secondary",
        className,
      )}
      aria-hidden="true"
    >
      {provider === "deepseek" ? (
        <SparklesIcon className="size-full" />
      ) : provider === "anthropic" ? (
        <AnthropicIcon className="size-full" />
      ) : (
        <OpenAIIcon className="size-full" />
      )}
    </span>
  );
}

function OpenAIIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 256 260"
      className={className}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M239.184 106.203a64.716 64.716 0 0 0-5.576-53.103C219.452 28.459 191 15.784 163.213 21.74A65.586 65.586 0 0 0 52.096 45.22a64.716 64.716 0 0 0-43.23 31.36c-14.31 24.602-11.061 55.634 8.033 76.74a64.665 64.665 0 0 0 5.525 53.102c14.174 24.65 42.644 37.324 70.446 31.36a64.72 64.72 0 0 0 48.754 21.744c28.481.025 53.714-18.361 62.414-45.481a64.767 64.767 0 0 0 43.229-31.36c14.137-24.558 10.875-55.423-8.083-76.483Zm-97.56 136.338a48.397 48.397 0 0 1-31.105-11.255l1.535-.87 51.67-29.825a8.595 8.595 0 0 0 4.247-7.367v-72.85l21.845 12.636c.218.111.37.32.409.563v60.367c-.056 26.818-21.783 48.545-48.601 48.601Zm-104.466-44.61a48.345 48.345 0 0 1-5.781-32.589l1.534.921 51.722 29.826a8.339 8.339 0 0 0 8.441 0l63.181-36.425v25.221a.87.87 0 0 1-.358.665l-52.335 30.184c-23.257 13.398-52.97 5.431-66.404-17.803ZM23.549 85.38a48.499 48.499 0 0 1 25.58-21.333v61.39a8.288 8.288 0 0 0 4.195 7.316l62.874 36.272-21.845 12.636a.819.819 0 0 1-.767 0L41.353 151.53c-23.211-13.454-31.171-43.144-17.804-66.405v.256Zm179.466 41.695-63.08-36.63L161.73 77.86a.819.819 0 0 1 .768 0l52.233 30.184a48.6 48.6 0 0 1-7.316 87.635v-61.391a8.544 8.544 0 0 0-4.4-7.213Zm21.742-32.69-1.535-.922-51.619-30.081a8.39 8.39 0 0 0-8.492 0L99.98 99.808V74.587a.716.716 0 0 1 .307-.665l52.233-30.133a48.652 48.652 0 0 1 72.236 50.391v.205ZM88.061 139.097l-21.845-12.585a.87.87 0 0 1-.41-.614V65.685a48.652 48.652 0 0 1 79.757-37.346l-1.535.87-51.67 29.825a8.595 8.595 0 0 0-4.246 7.367l-.051 72.697Zm11.868-25.58 28.138-16.217 28.188 16.218v32.434l-28.086 16.218-28.188-16.218-.052-32.434Z" />
    </svg>
  );
}

function AnthropicIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M13.827 3.52h3.603L24 20h-3.603l-6.57-16.48zm-7.258 0h3.767L16.906 20h-3.674l-1.343-3.461H5.017l-1.344 3.46H0L6.57 3.522zm4.132 9.959L8.453 7.687 6.205 13.48H10.7z"
        clipRule="evenodd"
      />
    </svg>
  );
}
