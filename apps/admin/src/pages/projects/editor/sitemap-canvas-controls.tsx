import { Button } from "@arclayer/ui/button";
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
  return (
    <TooltipProvider>
      <div className="absolute top-1/2 left-4 z-30 flex -translate-y-1/2 flex-col gap-1 rounded-lg border border-border bg-background p-1 shadow-sm">
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
      </div>
    </TooltipProvider>
  );
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
    <div className="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-border bg-background p-1 shadow-sm">
      <Button
        variant="ghost"
        size="icon-sm"
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
        aria-label={t("CREATION_EDITOR_ZOOM_IN")}
        onClick={() => onZoomChange(zoom + 0.1)}
      >
        <Plus className="size-4" />
      </Button>
      <span className="mx-1 h-5 w-px bg-border" />
      <Button
        variant="ghost"
        size="icon-sm"
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
    <Tooltip side="right">
      <TooltipTrigger asChild>
        <Button
          variant={active ? "secondary" : "ghost"}
          size="icon"
          className="min-h-11 min-w-11"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          <Icon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{disabled ? disabledReason : label}</TooltipContent>
    </Tooltip>
  );
}
