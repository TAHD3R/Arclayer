import { ComposerPrimitive, unstable_useTriggerPopoverScopeContext } from "@assistant-ui/react";
import { useNavigate } from "@tanstack/react-router";
import { BotIcon, FileTextIcon, FolderIcon, ImageIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import {
  AIComposerSkillPanelContent,
  type AIComposerSkillOption,
} from "@/components/ai/ai-composer-skill-panel";
import { AI_COMPOSER_SKILL_CREATOR_COMMAND } from "@/components/ai/ai-composer-directives";
import { AIComposerTriggerScrollArea } from "@/components/ai/ai-composer-trigger-scroll-area";
import { cn } from "@arclayer/lib/utils";
import { ChromeTabs, ChromeTabsList, ChromeTabsTrigger } from "@arclayer/ui/chrome-tabs";

type TriggerPopoverPlacement = "top" | "bottom";

const POPOVER_VIEWPORT_MARGIN_PX = 16;
const POPOVER_ANCHOR_GAP_PX = 8;
const POPOVER_MAX_HEIGHT_PX = 384;
const POPOVER_MIN_COMFORTABLE_HEIGHT_PX = 192;
const ACTIVE_POPOVER_COUNT = new WeakMap<HTMLElement, number>();

function retainComposerLayer(shell: HTMLElement) {
  ACTIVE_POPOVER_COUNT.set(shell, (ACTIVE_POPOVER_COUNT.get(shell) ?? 0) + 1);
  shell.dataset.triggerOpen = "true";
}

function releaseComposerLayer(shell: HTMLElement) {
  const nextCount = (ACTIVE_POPOVER_COUNT.get(shell) ?? 1) - 1;
  if (nextCount > 0) {
    ACTIVE_POPOVER_COUNT.set(shell, nextCount);
    return;
  }
  ACTIVE_POPOVER_COUNT.delete(shell);
  delete shell.dataset.triggerOpen;
}

function useViewportBoundedPopover(open: boolean, preferredPlacement: TriggerPopoverPlacement) {
  const markerRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const popover = markerRef.current?.parentElement;
    if (!open || !popover) return undefined;
    const composerShell = popover.closest<HTMLElement>("[data-ai-composer-shell]");
    if (composerShell) retainComposerLayer(composerShell);

    const updatePlacement = () => {
      const anchor = popover.offsetParent instanceof HTMLElement ? popover.offsetParent : popover;
      const anchorRect = anchor.getBoundingClientRect();
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const availableTop = anchorRect.top - POPOVER_ANCHOR_GAP_PX - POPOVER_VIEWPORT_MARGIN_PX;
      const availableBottom =
        viewportHeight - anchorRect.bottom - POPOVER_ANCHOR_GAP_PX - POPOVER_VIEWPORT_MARGIN_PX;
      const preferredAvailable = preferredPlacement === "bottom" ? availableBottom : availableTop;
      const oppositeAvailable = preferredPlacement === "bottom" ? availableTop : availableBottom;
      const placement =
        preferredAvailable < POPOVER_MIN_COMFORTABLE_HEIGHT_PX &&
        oppositeAvailable > preferredAvailable
          ? preferredPlacement === "bottom"
            ? "top"
            : "bottom"
          : preferredPlacement;
      const availableHeight = placement === "bottom" ? availableBottom : availableTop;

      popover.dataset.resolvedPlacement = placement;
      popover.style.top = placement === "bottom" ? "calc(100% + 0.5rem)" : "auto";
      popover.style.bottom = placement === "top" ? "calc(100% + 0.5rem)" : "auto";
      popover.style.marginTop = "0";
      popover.style.marginBottom = "0";
      popover.style.transformOrigin = placement === "bottom" ? "top" : "bottom";
      popover.style.maxHeight = `${Math.max(0, Math.min(POPOVER_MAX_HEIGHT_PX, availableHeight))}px`;
    };

    updatePlacement();
    window.addEventListener("resize", updatePlacement);
    window.visualViewport?.addEventListener("resize", updatePlacement);
    return () => {
      window.removeEventListener("resize", updatePlacement);
      window.visualViewport?.removeEventListener("resize", updatePlacement);
      delete popover.dataset.resolvedPlacement;
      for (const property of [
        "top",
        "bottom",
        "margin-top",
        "margin-bottom",
        "transform-origin",
        "max-height",
      ]) {
        popover.style.removeProperty(property);
      }
      if (composerShell) releaseComposerLayer(composerShell);
    };
  }, [open, preferredPlacement]);

  return markerRef;
}

function triggerItemClassName(index: number) {
  return cn(
    "flex w-full min-w-0 items-start gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
    "hover:bg-muted data-[highlighted]:bg-muted",
    index > 0 && "mt-0.5",
  );
}

export function AIComposerMentionPopoverContent(props: { placement: TriggerPopoverPlacement }) {
  const { t } = useTranslation("ai");
  const scope = unstable_useTriggerPopoverScopeContext();
  const markerRef = useViewportBoundedPopover(scope.open, props.placement);

  useEffect(() => {
    if (!scope.open || scope.activeCategoryId || scope.categories.length === 0) return;
    scope.selectCategory(scope.categories[0].id);
  }, [scope]);

  useEffect(() => {
    if (!scope.open || scope.categories.length < 2) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        (event.key !== "ArrowLeft" && event.key !== "ArrowRight") ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        !(event.target instanceof HTMLTextAreaElement) ||
        !event.target.closest("[data-ai-composer-shell]")
      ) {
        return;
      }
      const activeIndex = Math.max(
        0,
        scope.categories.findIndex((category) => category.id === scope.activeCategoryId),
      );
      const offset = event.key === "ArrowRight" ? 1 : -1;
      const nextIndex = (activeIndex + offset + scope.categories.length) % scope.categories.length;
      event.preventDefault();
      scope.selectCategory(scope.categories[nextIndex].id);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [scope.activeCategoryId, scope.categories, scope.open, scope.selectCategory]);

  if (!scope.open) return null;

  return (
    <>
      <span ref={markerRef} className="hidden" aria-hidden="true" />
      {scope.categories.length > 0 ? (
        <ChromeTabs
          value={scope.activeCategoryId ?? scope.categories[0]?.id}
          onValueChange={scope.selectCategory}
          className="shrink-0 border-b border-border/60 px-1 pt-0.5"
        >
          <ChromeTabsList
            size="mini"
            wrapperClassName="block w-full min-w-0"
            className="w-max min-w-full gap-0"
          >
            {scope.categories.map((category) => (
              <ChromeTabsTrigger key={category.id} value={category.id} size="mini">
                {category.label}
              </ChromeTabsTrigger>
            ))}
          </ChromeTabsList>
        </ChromeTabs>
      ) : null}
      <AIComposerTriggerScrollArea>
        <ComposerPrimitive.Unstable_TriggerPopoverItems className="p-1">
          {(items) =>
            items.length > 0 ? (
              items.map((item, index) => (
                <ComposerPrimitive.Unstable_TriggerPopoverItem
                  key={item.id}
                  item={item}
                  index={index}
                  className={triggerItemClassName(index)}
                >
                  <MentionItemIcon type={item.type} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{item.label}</span>
                    {item.description ? (
                      <span className="mt-0.5 block truncate text-caption text-label-secondary">
                        {item.description}
                      </span>
                    ) : null}
                  </span>
                </ComposerPrimitive.Unstable_TriggerPopoverItem>
              ))
            ) : (
              <div className="px-3 py-8 text-center text-footnote text-label-secondary">
                {t("AI_CHAT_MENTION_EMPTY")}
              </div>
            )
          }
        </ComposerPrimitive.Unstable_TriggerPopoverItems>
      </AIComposerTriggerScrollArea>
    </>
  );
}

function MentionItemIcon({ type }: { type: string }) {
  const Icon =
    type === "agent"
      ? BotIcon
      : type === "asset"
        ? ImageIcon
        : type === "content"
          ? FileTextIcon
          : FolderIcon;
  return <Icon className="mt-0.5 size-4 shrink-0 text-label-secondary" aria-hidden="true" />;
}

export function AIComposerSlashPopoverContent(props: {
  isErrorSkills?: boolean;
  isLoadingSkills: boolean;
  placement: TriggerPopoverPlacement;
  skills: readonly AIComposerSkillOption[];
}) {
  const navigate = useNavigate();
  const scope = unstable_useTriggerPopoverScopeContext();
  const markerRef = useViewportBoundedPopover(scope.open, props.placement);
  const skillCreator = props.skills.find(
    (skill) => skill.command === AI_COMPOSER_SKILL_CREATOR_COMMAND,
  );

  if (!scope.open) return null;

  return (
    <>
      <span ref={markerRef} className="hidden" aria-hidden="true" />
      <AIComposerSkillPanelContent
        presentation="trigger"
        skills={props.skills}
        isLoading={props.isLoadingSkills}
        isError={props.isErrorSkills}
        buildWithArclayerDisabled={!skillCreator}
        onManage={() => {
          void navigate({ to: "/customization/skills" });
          scope.close();
        }}
        onBuildWithArclayer={() => {
          if (!skillCreator) throw new Error("AI_COMPOSER_SKILL_CREATOR_UNAVAILABLE");
          scope.selectItem({
            type: "skill",
            id: skillCreator.id,
            label: skillCreator.label,
            description: skillCreator.description,
            ...(skillCreator.command ? { metadata: { command: skillCreator.command } } : {}),
          });
        }}
        onWriteManually={() => {
          void navigate({ to: "/customization/skills", search: { action: "manual" } });
          scope.close();
        }}
        onImportGitHub={() => {
          void navigate({ to: "/customization/skills", search: { action: "github" } });
          scope.close();
        }}
        onUploadZip={() => {
          void navigate({ to: "/customization/skills", search: { action: "zip" } });
          scope.close();
        }}
      />
    </>
  );
}
