import { useTranslation } from "react-i18next";
import {
  Monitor,
  Tablet,
  Smartphone,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Save,
  Globe,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useEditorStore, type DevicePreset } from "@/pages/workspaces/editor/stores/editor-store";

const ZOOM_STEP = 10;

const DEVICE_ICONS = {
  desktop: Monitor,
  tablet: Tablet,
  mobile: Smartphone,
} as const;

const DEVICE_KEYS: DevicePreset[] = ["desktop", "tablet", "mobile"];

type ToolbarProps = {
  onUndo: () => void;
  onRedo: () => void;
  onSave?: () => void;
  onPublish?: () => void;
};

export function Toolbar({ onUndo, onRedo, onSave, onPublish }: ToolbarProps) {
  const { t } = useTranslation(["content_pages"]);

  const isDirty = useEditorStore((s) => s.isDirty);
  const isSaving = useEditorStore((s) => s.isSaving);
  const isPublishing = useEditorStore((s) => s.isPublishing);
  const canUndo = useEditorStore((s) => s.canUndo);
  const canRedo = useEditorStore((s) => s.canRedo);
  const devicePreset = useEditorStore((s) => s.devicePreset);
  const zoomPercent = useEditorStore((s) => s.zoomPercent);
  const setDevicePreset = useEditorStore((s) => s.setDevicePreset);
  const setZoomPercent = useEditorStore((s) => s.setZoomPercent);

  return (
    <TooltipProvider>
      <div className="flex h-12 shrink-0 items-center justify-between border-b bg-card px-3">
        {/* Left: save & publish */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={isDirty ? "default" : "ghost"}
                size="icon-sm"
                disabled={isSaving || !isDirty}
                onClick={onSave}
              >
                <Save />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {t("content_pages:EDITOR_V2_TOOLBAR_SAVE", { defaultValue: "Save" })}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" disabled={isPublishing} onClick={onPublish}>
                <Globe />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {t("content_pages:EDITOR_V2_TOOLBAR_PUBLISH", { defaultValue: "Publish" })}
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Center: undo/redo + device switcher */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" disabled={!canUndo} onClick={onUndo}>
                <Undo2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {t("content_pages:EDITOR_V2_TOOLBAR_UNDO", { defaultValue: "Undo" })}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" disabled={!canRedo} onClick={onRedo}>
                <Redo2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {t("content_pages:EDITOR_V2_TOOLBAR_REDO", { defaultValue: "Redo" })}
            </TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="mx-1 h-5" />

          {DEVICE_KEYS.map((key) => {
            const Icon = DEVICE_ICONS[key];
            return (
              <Tooltip key={key}>
                <TooltipTrigger asChild>
                  <Button
                    variant={devicePreset === key ? "secondary" : "ghost"}
                    size="icon-sm"
                    onClick={() => setDevicePreset(key)}
                  >
                    <Icon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {t(`content_pages:EDITOR_V2_TOOLBAR_DEVICE_${key.toUpperCase()}` as const, {
                    defaultValue: key,
                  })}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* Right: zoom controls */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={zoomPercent <= 25}
                onClick={() => setZoomPercent(zoomPercent - ZOOM_STEP)}
              >
                <ZoomOut />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {t("content_pages:EDITOR_V2_TOOLBAR_ZOOM_OUT", { defaultValue: "Zoom out" })}
            </TooltipContent>
          </Tooltip>

          <span className="w-10 text-center text-xs tabular-nums text-muted-foreground">
            {zoomPercent}%
          </span>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={zoomPercent >= 200}
                onClick={() => setZoomPercent(zoomPercent + ZOOM_STEP)}
              >
                <ZoomIn />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {t("content_pages:EDITOR_V2_TOOLBAR_ZOOM_IN", { defaultValue: "Zoom in" })}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={zoomPercent === 100}
                onClick={() => setZoomPercent(100)}
              >
                <RotateCcw />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {t("content_pages:EDITOR_V2_TOOLBAR_ZOOM_RESET", { defaultValue: "Reset zoom" })}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}
