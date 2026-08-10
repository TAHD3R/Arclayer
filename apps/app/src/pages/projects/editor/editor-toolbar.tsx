import { cn } from "@arclayer/lib/utils";
import { Badge } from "@arclayer/ui/badge";
import { Button } from "@arclayer/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@arclayer/ui/tooltip";
import type { SiteRevisionLifecycleStatus } from "@arclayer/openapi";
import { ArrowLeft, Eye, Redo2, Send, Undo2 } from "lucide-react";
import { useTranslation } from "react-i18next";

export type EditorStage = "sitemap" | "wireframe" | "styleGuide" | "design";
export type EditorSyncState =
  | "saved"
  | "queued"
  | "saving"
  | "previewing"
  | "review"
  | "applying"
  | "conflict"
  | "error";

const STAGES: ReadonlyArray<{
  id: EditorStage;
  translationKey: "SITEMAP" | "WIREFRAME" | "STYLE_GUIDE" | "DESIGN";
  available: boolean;
}> = [
  { id: "sitemap", translationKey: "SITEMAP", available: true },
  { id: "wireframe", translationKey: "WIREFRAME", available: true },
  { id: "styleGuide", translationKey: "STYLE_GUIDE", available: true },
  { id: "design", translationKey: "DESIGN", available: true },
];

interface EditorToolbarProps {
  projectName: string;
  revisionNumber: number;
  status: SiteRevisionLifecycleStatus;
  stage: EditorStage;
  onStageChange: (stage: EditorStage) => void;
  onBack: () => void;
  onPreview: () => void;
  previewDisabledReason?: string;
  designDisabledReason?: string;
  undoDisabledReason?: string;
  redoDisabledReason?: string;
  onUndo?: () => void;
  onRedo?: () => void;
  syncState: EditorSyncState;
  syncStateLabel: string;
}

export function EditorToolbar({
  projectName,
  revisionNumber,
  status,
  stage,
  onStageChange,
  onBack,
  onPreview,
  previewDisabledReason,
  designDisabledReason,
  undoDisabledReason,
  redoDisabledReason,
  onUndo,
  onRedo,
  syncState,
  syncStateLabel,
}: EditorToolbarProps) {
  const { t } = useTranslation("account");
  return (
    <TooltipProvider>
      <header className="relative z-40 grid min-h-14 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 border-b border-border bg-background px-3 py-2 lg:flex lg:h-14 lg:py-0">
        <div className="flex min-w-0 items-center gap-2 overflow-hidden lg:flex-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-11 lg:size-9"
            onClick={onBack}
            aria-label={t("CREATION_EDITOR_BACK")}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0 border-l border-border pl-3">
            <div className="flex items-center gap-2">
              <span className="block max-w-[min(12rem,32vw)] truncate text-body font-semibold text-label-primary sm:max-w-48">
                {projectName}
              </span>
              <Badge variant="outline" className="font-mono font-normal">
                v{revisionNumber}
              </Badge>
              <Badge
                variant="outline"
                role="status"
                aria-live="polite"
                className={cn(
                  "hidden font-normal sm:inline-flex",
                  syncState === "conflict" && "border-warning/60 text-warning",
                  syncState === "error" && "border-destructive/60 text-destructive",
                  syncState === "applying" && "border-primary/60 text-primary",
                  (syncState === "saving" || syncState === "queued") &&
                    "border-primary/60 text-primary",
                )}
              >
                {syncStateLabel}
              </Badge>
            </div>
            <span className="sr-only">
              {t(`CREATION_EDITOR_REVISION_STATUS_${status.toUpperCase()}`)}
            </span>
          </div>
        </div>

        <nav
          aria-label={t("CREATION_EDITOR_STAGE_NAV")}
          className="order-3 col-span-2 mt-2 flex w-full min-w-0 items-center gap-1 overflow-x-auto rounded-lg bg-muted/65 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:absolute lg:left-1/2 lg:order-none lg:col-auto lg:mt-0 lg:w-auto lg:-translate-x-1/2 lg:overflow-visible"
        >
          {STAGES.map((item) => {
            const active = item.id === stage;
            const label = t(`CREATION_EDITOR_STAGE_${item.translationKey}`);
            const disabledReason =
              item.id === "design"
                ? designDisabledReason
                : item.available
                  ? undefined
                  : t("CREATION_EDITOR_STAGE_PENDING");
            const available = item.available && !disabledReason;
            return (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-current={active ? "page" : undefined}
                    aria-disabled={!available}
                    disabled={!available}
                    onClick={() => onStageChange(item.id)}
                    className={cn(
                      "min-h-11 shrink-0 rounded-md px-3 text-footnote font-medium transition-[background-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 motion-reduce:transition-none lg:min-h-8",
                      active
                        ? "bg-background text-label-primary shadow-sm"
                        : "text-label-secondary hover:text-label-primary disabled:cursor-not-allowed disabled:opacity-55",
                    )}
                  >
                    {label}
                  </button>
                </TooltipTrigger>
                {disabledReason ? <TooltipContent>{disabledReason}</TooltipContent> : null}
              </Tooltip>
            );
          })}
        </nav>

        <div className="flex min-w-0 items-center justify-end gap-1 lg:flex-1">
          {onUndo && !undoDisabledReason ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("CREATION_EDITOR_UNDO")}
              onClick={onUndo}
            >
              <Undo2 className="size-4" />
            </Button>
          ) : (
            <UnavailableAction
              icon={Undo2}
              label={t("CREATION_EDITOR_UNDO")}
              reason={undoDisabledReason ?? t("CREATION_EDITOR_UNDO_PENDING")}
            />
          )}
          {onRedo && !redoDisabledReason ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("CREATION_EDITOR_REDO")}
              onClick={onRedo}
            >
              <Redo2 className="size-4" />
            </Button>
          ) : (
            <UnavailableAction
              icon={Redo2}
              label={t("CREATION_EDITOR_REDO")}
              reason={redoDisabledReason ?? t("CREATION_EDITOR_UNDO_PENDING")}
            />
          )}
          <span className="mx-1 h-5 w-px bg-border" />
          <PreviewAction
            onPreview={onPreview}
            disabledReason={previewDisabledReason}
            label={t("CREATION_EDITOR_PREVIEW")}
          />
          <UnavailableAction
            icon={Send}
            label={t("CREATION_EDITOR_PUBLISH")}
            reason={t("CREATION_EDITOR_PUBLISH_PENDING")}
            text
            primary
          />
        </div>
      </header>
    </TooltipProvider>
  );
}

function PreviewAction({
  onPreview,
  disabledReason,
  label,
}: Readonly<{
  onPreview: () => void;
  disabledReason?: string;
  label: string;
}>) {
  const button = (
    <Button
      variant="ghost"
      size="sm"
      disabled={Boolean(disabledReason)}
      aria-label={label}
      onClick={onPreview}
    >
      <Eye className="size-4" />
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
  if (!disabledReason) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{button}</span>
      </TooltipTrigger>
      <TooltipContent>{disabledReason}</TooltipContent>
    </Tooltip>
  );
}

function UnavailableAction({
  icon: Icon,
  label,
  reason,
  text,
  primary,
}: {
  icon: typeof Undo2;
  label: string;
  reason: string;
  text?: boolean;
  primary?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <Button
            variant={primary ? "default" : "ghost"}
            size={text ? "sm" : "icon-sm"}
            disabled
            aria-label={label}
          >
            <Icon className="size-4" />
            {text ? <span className="hidden sm:inline">{label}</span> : null}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}
