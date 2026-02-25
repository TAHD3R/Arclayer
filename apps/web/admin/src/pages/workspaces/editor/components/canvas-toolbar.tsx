import { useEffect } from "react";
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
  ChevronDown,
  MousePointer2,
  Hand,
} from "lucide-react";
import { Button, Tooltip, InputNumber, Radio, Checkbox, Space, Dropdown } from "antd";
import type { MenuProps } from "antd";

import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  useEditorStore,
  type DevicePreset,
  type RulerMode,
} from "@/pages/workspaces/editor/stores/editor-store";
import { useEditorBridgeContext } from "@/pages/workspaces/editor/contexts/editor-bridge-context";
import { useEditorHistory } from "@/pages/workspaces/editor/hooks/use-editor-history";

const ZOOM_STEP = 10;

const DEVICE_ICONS = {
  desktop: Monitor,
  tablet: Tablet,
  mobile: Smartphone,
} as const;

const DEVICE_KEYS: DevicePreset[] = ["desktop", "tablet", "mobile"];

const DEVICE_NUMERIC_WIDTHS: Record<DevicePreset, number> = {
  desktop: 1920,
  tablet: 768,
  mobile: 375,
};

const RULER_OPTIONS: { value: RulerMode; labelKey: string; defaultValue: string }[] = [
  { value: "off", labelKey: "content_pages:EDITOR_V2_CANVAS_RULER_OFF", defaultValue: "Off" },
  {
    value: "ruler",
    labelKey: "content_pages:EDITOR_V2_CANVAS_RULER_PINNED",
    defaultValue: "Pinned ruler",
  },
  {
    value: "ruler-crosshair",
    labelKey: "content_pages:EDITOR_V2_CANVAS_RULER_CROSSHAIR",
    defaultValue: "Ruler + crosshair",
  },
];

const ZOOM_PRESETS = [50, 75, 100, 125, 150, 200];

export function CanvasToolbar() {
  const { t } = useTranslation(["content_pages"]);
  const { portal } = useEditorBridgeContext();

  const canUndo = useEditorStore((s) => s.canUndo);
  const canRedo = useEditorStore((s) => s.canRedo);
  const devicePreset = useEditorStore((s) => s.devicePreset);
  const zoomPercent = useEditorStore((s) => s.zoomPercent);
  const canvasWidth = useEditorStore((s) => s.canvasWidth);
  const rulerMode = useEditorStore((s) => s.rulerMode);
  const showLineGuides = useEditorStore((s) => s.showLineGuides);
  const activeTool = useEditorStore((s) => s.activeTool);
  const setDevicePreset = useEditorStore((s) => s.setDevicePreset);
  const setZoomPercent = useEditorStore((s) => s.setZoomPercent);
  const setCanvasWidth = useEditorStore((s) => s.setCanvasWidth);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);

  const { onUndo, onRedo } = useEditorHistory(portal);

  const displayWidth = canvasWidth ?? DEVICE_NUMERIC_WIDTHS[devicePreset];

  // Keyboard shortcuts for tool switching
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || (e.target as HTMLElement).isContentEditable) {
        return;
      }
      if (e.key === "v" || e.key === "V") {
        setActiveTool("select");
      } else if (e.key === "h" || e.key === "H") {
        setActiveTool("hand");
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setActiveTool]);

  // Zoom dropdown menu items
  const zoomMenuItems: MenuProps["items"] = [
    {
      key: "fit",
      label: t("content_pages:EDITOR_V2_TOOLBAR_ZOOM_FIT", { defaultValue: "Zoom to Fit" }),
      onClick: () => setZoomPercent(100),
    },
    { type: "divider" },
    ...ZOOM_PRESETS.map((value) => ({
      key: String(value),
      label: `${value}%`,
      onClick: () => setZoomPercent(value),
    })),
  ];

  return (
    <div className="flex h-10 shrink-0 items-center justify-between border-b bg-card px-3">
      {/* Left: Select/Hand toggle + Undo / Redo */}
      <div className="flex items-center gap-1">
        <Space.Compact>
          <Tooltip
            title={t("content_pages:EDITOR_V2_TOOLBAR_TOOL_SELECT", {
              defaultValue: "Select (V)",
            })}
          >
            <Button
              type={activeTool === "select" ? "primary" : "default"}
              icon={<MousePointer2 className="size-4" />}
              onClick={() => setActiveTool("select")}
            />
          </Tooltip>
          <Tooltip
            title={t("content_pages:EDITOR_V2_TOOLBAR_TOOL_HAND", {
              defaultValue: "Hand (H)",
            })}
          >
            <Button
              type={activeTool === "hand" ? "primary" : "default"}
              icon={<Hand className="size-4" />}
              onClick={() => setActiveTool("hand")}
            />
          </Tooltip>
        </Space.Compact>

        <div className="mx-1 h-5 w-px bg-border" />

        <Tooltip title={t("content_pages:EDITOR_V2_TOOLBAR_UNDO", { defaultValue: "Undo" })}>
          <Button
            type="text"
            disabled={!canUndo}
            icon={<Undo2 className="size-4" />}
            onClick={onUndo}
          />
        </Tooltip>
        <Tooltip title={t("content_pages:EDITOR_V2_TOOLBAR_REDO", { defaultValue: "Redo" })}>
          <Button
            type="text"
            disabled={!canRedo}
            icon={<Redo2 className="size-4" />}
            onClick={onRedo}
          />
        </Tooltip>
      </div>

      {/* Center: Device preset switcher + Canvas Settings */}
      <div className="flex items-center gap-0.5">
        <Space.Compact>
          {DEVICE_KEYS.map((key) => {
            const Icon = DEVICE_ICONS[key];
            const isActive = devicePreset === key;
            return (
              <Tooltip
                key={key}
                title={t(`content_pages:EDITOR_V2_TOOLBAR_DEVICE_${key.toUpperCase()}` as const, {
                  defaultValue: key,
                })}
              >
                <Button
                  type={isActive ? "primary" : "default"}
                  icon={<Icon className="size-4" />}
                  onClick={() => setDevicePreset(key)}
                />
              </Tooltip>
            );
          })}
        </Space.Compact>

        {/* Canvas Settings Popover */}
        <Popover>
          <PopoverTrigger asChild>
            <Button type="text" className="ml-1 gap-0.5! tabular-nums">
              <span className="text-callout text-secondary">{displayWidth} px</span>
              <ChevronDown className="size-3 text-label-secondary" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="center" className="w-64 space-y-3 p-3">
            <div>
              <p className="text-callout font-medium">
                {t("content_pages:EDITOR_V2_CANVAS_SETTINGS_TITLE", {
                  defaultValue: "Canvas Settings",
                })}
              </p>
              <p className="text-caption text-label-secondary">
                {t("content_pages:EDITOR_V2_CANVAS_SETTINGS_DESC", {
                  defaultValue: "Adjust viewport dimensions and display options",
                })}
              </p>
            </div>

            {/* Width */}
            <label className="flex items-center gap-2 text-callout">
              <span className="w-16 shrink-0 text-label-secondary">
                {t("content_pages:EDITOR_V2_CANVAS_SETTINGS_WIDTH", { defaultValue: "Width" })}
              </span>
              <InputNumber
                className="flex-1"
                min={320}
                max={3840}
                value={displayWidth}
                suffix="px"
                onChange={(val) => setCanvasWidth(val ?? null)}
              />
            </label>

            {/* Scale */}
            <label className="flex items-center gap-2 text-callout">
              <span className="w-16 shrink-0 text-label-secondary">
                {t("content_pages:EDITOR_V2_CANVAS_SETTINGS_SCALE", { defaultValue: "Scale" })}
              </span>
              <InputNumber
                className="flex-1"
                min={25}
                max={200}
                value={zoomPercent}
                suffix="%"
                onChange={(val) => {
                  if (val != null) setZoomPercent(val);
                }}
              />
            </label>

            <div className="border-t pt-2" />

            {/* Ruler — disabled, coming soon */}
            <Tooltip
              title={t("content_pages:EDITOR_V2_COMING_SOON", { defaultValue: "Coming soon" })}
            >
              <div className="flex flex-col gap-1.5 opacity-50">
                <span className="text-callout text-label-secondary">
                  {t("content_pages:EDITOR_V2_CANVAS_SETTINGS_RULER", { defaultValue: "Ruler" })}
                </span>
                <Radio.Group value={rulerMode} disabled>
                  <div className="flex flex-col gap-1">
                    {RULER_OPTIONS.map((opt) => (
                      <Radio key={opt.value} value={opt.value}>
                        <span className="text-callout">
                          {t(opt.labelKey, { defaultValue: opt.defaultValue })}
                        </span>
                      </Radio>
                    ))}
                  </div>
                </Radio.Group>
              </div>
            </Tooltip>

            {/* Line guides — disabled, coming soon */}
            <Tooltip
              title={t("content_pages:EDITOR_V2_COMING_SOON", { defaultValue: "Coming soon" })}
            >
              <div className="opacity-50">
                <Checkbox checked={showLineGuides} disabled>
                  <span className="text-callout">
                    {t("content_pages:EDITOR_V2_CANVAS_SETTINGS_LINE_GUIDES", {
                      defaultValue: "Show line guides",
                    })}
                  </span>
                </Checkbox>
              </div>
            </Tooltip>
          </PopoverContent>
        </Popover>
      </div>

      {/* Right: Zoom controls */}
      <div className="flex items-center gap-1">
        <Tooltip
          title={t("content_pages:EDITOR_V2_TOOLBAR_ZOOM_OUT", { defaultValue: "Zoom out" })}
        >
          <Button
            type="text"
            disabled={zoomPercent <= 25}
            icon={<ZoomOut className="size-4" />}
            onClick={() => setZoomPercent(zoomPercent - ZOOM_STEP)}
          />
        </Tooltip>

        <Dropdown menu={{ items: zoomMenuItems }} trigger={["click"]}>
          <Button type="text" className="gap-0.5! tabular-nums">
            <span className="text-callout text-label-secondary">{zoomPercent}%</span>
            <ChevronDown className="size-3 text-label-secondary" />
          </Button>
        </Dropdown>

        <Tooltip title={t("content_pages:EDITOR_V2_TOOLBAR_ZOOM_IN", { defaultValue: "Zoom in" })}>
          <Button
            type="text"
            disabled={zoomPercent >= 200}
            icon={<ZoomIn className="size-4" />}
            onClick={() => setZoomPercent(zoomPercent + ZOOM_STEP)}
          />
        </Tooltip>

        <Tooltip
          title={t("content_pages:EDITOR_V2_TOOLBAR_ZOOM_RESET", { defaultValue: "Reset zoom" })}
        >
          <Button
            type="text"
            disabled={zoomPercent === 100}
            icon={<RotateCcw className="size-4" />}
            onClick={() => setZoomPercent(100)}
          />
        </Tooltip>
      </div>
    </div>
  );
}
