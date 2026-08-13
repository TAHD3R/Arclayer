import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@arclayer/ui/tooltip";
import { Redo2, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AskAiButton } from "@/components/ai/ask-ai-button";
import { EditorLogoMenu } from "@/layouts/creation-layout-menu";
import { ProjectInlineNameEditor } from "@/pages/usercenter/projects/components/project-inline-name-editor";

export type EditorStage = "sitemap" | "wireframe" | "styleGuide" | "design";

const STAGES: ReadonlyArray<{
  id: EditorStage;
  translationKey: "SITEMAP" | "WIREFRAME" | "STYLE_GUIDE" | "DESIGN";
  available: boolean;
}> = [
  { id: "sitemap", translationKey: "SITEMAP", available: true },
  { id: "wireframe", translationKey: "WIREFRAME", available: true },
  { id: "design", translationKey: "DESIGN", available: true },
  { id: "styleGuide", translationKey: "STYLE_GUIDE", available: true },
];

interface EditorToolbarProps {
  projectName: string;
  stage: EditorStage;
  onStageChange: (stage: EditorStage) => void;
  onProjectNameChange?: (name: string) => void;
  onPreview: () => void;
  previewDisabledReason?: string;
  designDisabledReason?: string;
  undoDisabledReason?: string;
  redoDisabledReason?: string;
  onUndo?: () => void;
  onRedo?: () => void;
}

export function EditorToolbar({
  projectName,
  stage,
  onStageChange,
  onProjectNameChange,
  onPreview,
  previewDisabledReason,
  designDisabledReason,
  undoDisabledReason,
  redoDisabledReason,
  onUndo,
  onRedo,
}: EditorToolbarProps) {
  const { t } = useTranslation("account");
  const [renaming, setRenaming] = useState(false);
  const [projectNameDraft, setProjectNameDraft] = useState(projectName);

  useEffect(() => {
    if (!renaming) setProjectNameDraft(projectName);
  }, [projectName, renaming]);

  const commitProjectName = () => {
    setRenaming(false);
    const nextName = projectNameDraft.trim();
    if (nextName && nextName !== projectName) onProjectNameChange?.(nextName);
  };

  return (
    <TooltipProvider>
      <header className="relative z-40 grid min-h-14 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 bg-transparent px-3 py-2 lg:flex lg:h-14 lg:py-0 lg:px-4">
        <div className="flex min-w-0 items-center gap-2 overflow-hidden lg:flex-1">
          <EditorLogoMenu />
          <div className="min-w-0">
            {onProjectNameChange && renaming ? (
              <ProjectInlineNameEditor
                editing
                value={projectName}
                draftValue={projectNameDraft}
                ariaLabel={t("CREATION_EDITOR_PROJECT_RENAME")}
                maxLength={128}
                containerClassName="w-[min(20rem,34vw)] sm:w-72"
                inputClassName="h-9 py-1 text-body font-semibold"
                counterClassName="hidden"
                onDraftChange={setProjectNameDraft}
                onCommit={commitProjectName}
                onCancel={() => {
                  setProjectNameDraft(projectName);
                  setRenaming(false);
                }}
              />
            ) : onProjectNameChange ? (
              <button
                type="button"
                onClick={() => setRenaming(true)}
                className="max-w-[min(20rem,34vw)] truncate rounded-md px-2 py-1 text-left text-body font-semibold text-label-primary transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-72"
                aria-label={t("CREATION_EDITOR_PROJECT_RENAME")}
              >
                {projectName}
              </button>
            ) : (
              <span className="block max-w-[min(20rem,34vw)] truncate px-2 py-1 text-body font-semibold text-label-primary sm:max-w-72">
                {projectName}
              </span>
            )}
          </div>
        </div>

        <nav
          aria-label={t("CREATION_EDITOR_STAGE_NAV")}
          className="order-3 col-span-2 mt-2 flex w-full min-w-0 items-center gap-1 overflow-x-auto rounded-lg bg-muted/75 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:absolute lg:left-1/2 lg:order-none lg:col-auto lg:mt-0 lg:w-auto lg:-translate-x-1/2 lg:overflow-visible"
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
                      "min-h-11 shrink-0 rounded-md px-3 text-footnote font-medium transition-[background-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border/70 motion-reduce:transition-none lg:min-h-8",
                      active
                        ? "bg-background font-bold text-label-primary shadow-sm ring-1 ring-border/70"
                        : "text-label-secondary hover:bg-muted/70 hover:text-label-primary disabled:cursor-not-allowed disabled:opacity-55",
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

        <div
          data-creation-editor-actions
          className="flex min-w-0 items-center justify-end gap-1 overflow-x-auto lg:flex-1"
        >
          <AskAiButton labelKey="common:TOPBAR_ASK_AI" className="shrink-0" />
          <span className="mx-1 h-5 w-px shrink-0 bg-border" />
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
      <span>{label}</span>
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
  icon?: typeof Undo2;
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
            {Icon ? <Icon className="size-4" /> : null}
            {text ? <span className="hidden sm:inline">{label}</span> : null}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}
