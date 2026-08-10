import { Button } from "@arclayer/ui/button";
import { Highlight } from "@arclayer/ui/highlight";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@arclayer/ui/sidebar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@arclayer/ui/tooltip";
import {
  Focus,
  Minus,
  MousePointer2,
  PanelsTopLeft,
  Plus,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";

import { useCreationSidebarToolsSlot } from "@/layouts/creation-layout";

interface SitemapCanvasToolsProps {
  onAddPage: () => void;
  onManageSharedSections: () => void;
  onOpenAI: () => void;
  canEdit: boolean;
  editDisabledReason: string;
  canOpenAI: boolean;
  openAIDisabledReason: string;
}

export function SitemapCanvasTools({
  onAddPage,
  onManageSharedSections,
  onOpenAI,
  canEdit,
  editDisabledReason,
  canOpenAI,
  openAIDisabledReason,
}: SitemapCanvasToolsProps) {
  const { t } = useTranslation("account");
  const slot = useCreationSidebarToolsSlot();
  const menu = (
    <Highlight enabled={false} hover controlledItems mode="parent">
      <TooltipProvider>
        <SidebarMenu className="gap-1">
          <CanvasTool icon={MousePointer2} label={t("CREATION_EDITOR_TOOL_SELECT")} active />
          <CanvasTool
            icon={Plus}
            label={t("CREATION_EDITOR_TOOL_ADD_PAGE")}
            onClick={onAddPage}
            disabled={!canEdit}
            disabledReason={editDisabledReason}
          />
          <CanvasTool
            icon={PanelsTopLeft}
            label={t("CREATION_EDITOR_TOOL_SHARED_SECTIONS")}
            onClick={onManageSharedSections}
          />
          <CanvasTool
            icon={Sparkles}
            label={t("CREATION_EDITOR_TOOL_AI")}
            onClick={onOpenAI}
            disabled={!canOpenAI}
            disabledReason={openAIDisabledReason}
          />
        </SidebarMenu>
      </TooltipProvider>
    </Highlight>
  );

  return slot ? createPortal(menu, slot) : menu;
}

export function SitemapZoomControls({
  zoom,
  onZoomChange,
  onFit,
}: {
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onFit: () => void;
}) {
  const { t } = useTranslation("account");
  return (
    <div className="pointer-events-none absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-border bg-background p-1 shadow-sm">
      <Button
        variant="ghost"
        size="icon-sm"
        className="pointer-events-auto"
        aria-label={t("CREATION_EDITOR_ZOOM_OUT")}
        onClick={() => onZoomChange(zoom - 0.1)}
      >
        <Minus className="size-4" />
      </Button>
      <span className="w-14 text-center font-mono text-caption text-label-secondary tabular-nums">
        {Math.round(zoom * 100)}%
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        className="pointer-events-auto"
        aria-label={t("CREATION_EDITOR_ZOOM_IN")}
        onClick={() => onZoomChange(zoom + 0.1)}
      >
        <Plus className="size-4" />
      </Button>
      <span className="mx-1 h-5 w-px bg-border" />
      <Button
        variant="ghost"
        size="icon-sm"
        className="pointer-events-auto"
        aria-label={t("CREATION_EDITOR_FIT_CANVAS")}
        onClick={onFit}
      >
        <Focus className="size-4" />
      </Button>
    </div>
  );
}

function CanvasTool({
  icon: Icon,
  label,
  active,
  disabled,
  disabledReason,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  onClick?: () => void;
}) {
  return (
    <SidebarMenuItem className="group/nav-item">
      <Tooltip side="right">
        <TooltipTrigger asChild>
          <SidebarMenuButton
            isActive={active}
            tooltip={label}
            className="h-10 justify-center !px-1.5 !py-1.5 text-callout"
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
          >
            <span
              aria-hidden="true"
              className="inline-flex size-5 shrink-0 items-center justify-center"
            >
              <Icon className="size-full" />
            </span>
          </SidebarMenuButton>
        </TooltipTrigger>
        <TooltipContent>{disabled ? disabledReason : label}</TooltipContent>
      </Tooltip>
    </SidebarMenuItem>
  );
}
