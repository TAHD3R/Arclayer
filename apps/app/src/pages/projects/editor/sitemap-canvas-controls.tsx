import { Highlight } from "@arclayer/ui/highlight";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@arclayer/ui/sidebar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@arclayer/ui/tooltip";
import {
  LayoutTemplate,
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
  onAddPage: (anchor: HTMLElement) => void;
  onAddSection: (anchor: HTMLElement) => void;
  onManageSharedSections: (anchor: HTMLElement) => void;
  onOpenAI: () => void;
  canEdit: boolean;
  editDisabledReason: string;
  canOpenAI: boolean;
  openAIDisabledReason: string;
}

export function SitemapCanvasTools({
  onAddPage,
  onAddSection,
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
            icon={LayoutTemplate}
            label={t("CREATION_EDITOR_TOOL_ADD_SECTION")}
            onClick={onAddSection}
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
  onClick?: (anchor: HTMLElement) => void;
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
            onClick={(event) => onClick?.(event.currentTarget)}
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
