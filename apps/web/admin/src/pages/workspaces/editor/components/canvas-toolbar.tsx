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
import { useEffect, useRef, useState } from "react";

import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  useEditorStore,
  type DevicePreset,
  type RulerMode,
} from "@/pages/workspaces/editor/stores/editor-store";
import { useEditorActions } from "@/pages/workspaces/editor/hooks/use-editor-actions";
import { DEVICE_PRESET_WIDTHS } from "@/pages/workspaces/editor/constants/canvas";

const DEVICE_ICONS = {
  desktop: Monitor,
  tablet: Tablet,
  mobile: Smartphone,
} as const;

const DEVICE_KEYS: DevicePreset[] = ["desktop", "tablet", "mobile"];

const RULER_OPTIONS: { value: RulerMode; labelKey: string }[] = [
  { value: "off", labelKey: "content_pages:EDITOR_CANVAS_RULER_OFF" },
  { value: "ruler", labelKey: "content_pages:EDITOR_CANVAS_RULER_PINNED" },
  { value: "ruler-crosshair", labelKey: "content_pages:EDITOR_CANVAS_RULER_CROSSHAIR" },
];

const ZOOM_PRESETS = [50, 75, 100, 125, 150, 200];

export function CanvasToolbar() {
  const { t } = useTranslation(["content_pages"]);
  const actions = useEditorActions();

  const devicePreset = useEditorStore((s) => s.devicePreset);
  const zoomPercent = useEditorStore((s) => s.zoomPercent);
  const canvasWidth = useEditorStore((s) => s.canvasWidth);
  const rulerMode = useEditorStore((s) => s.rulerMode);
  const showLineGuides = useEditorStore((s) => s.showLineGuides);
  const activeTool = useEditorStore((s) => s.activeTool);
  const setDevicePreset = useEditorStore((s) => s.setDevicePreset);
  const setZoomPercent = useEditorStore((s) => s.setZoomPercent);
  const setCanvasWidth = useEditorStore((s) => s.setCanvasWidth);
  const overlayCloseSignal = useEditorStore((s) => s.overlayCloseSignal);

  const [canvasSettingsOpen, setCanvasSettingsOpen] = useState(false);
  const lastOverlayCloseSignalRef = useRef(overlayCloseSignal);

  useEffect(() => {
    // Only close when the signal actually changes.
    // Avoid "open -> immediately close" on initial mount or on local open state changes.
    if (overlayCloseSignal === lastOverlayCloseSignalRef.current) return;
    lastOverlayCloseSignalRef.current = overlayCloseSignal;

    if (!canvasSettingsOpen) return;
    setCanvasSettingsOpen(false);
  }, [canvasSettingsOpen, overlayCloseSignal]);

  const displayWidth = canvasWidth ?? DEVICE_PRESET_WIDTHS[devicePreset];

  // Zoom dropdown menu items
  const zoomMenuItems: MenuProps["items"] = [
    {
      key: "fit",
      label: t("content_pages:EDITOR_TOOLBAR_ZOOM_FIT"),
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
          <Tooltip title={t("content_pages:EDITOR_TOOLBAR_TOOL_SELECT")}>
            <Button
              type={activeTool === "select" ? "primary" : "default"}
              icon={<MousePointer2 className="size-4" />}
              onClick={() => void actions.run("tool.select")}
            />
          </Tooltip>
          <Tooltip title={t("content_pages:EDITOR_TOOLBAR_TOOL_HAND")}>
            <Button
              type={activeTool === "hand" ? "primary" : "default"}
              icon={<Hand className="size-4" />}
              onClick={() => void actions.run("tool.hand")}
            />
          </Tooltip>
        </Space.Compact>

        <div className="mx-1 h-5 w-px bg-border" />

        <Tooltip title={t("content_pages:EDITOR_TOOLBAR_UNDO")}>
          <Button
            type="text"
            disabled={!actions.isEnabled("edit.undo")}
            icon={<Undo2 className="size-4" />}
            onClick={() => void actions.run("edit.undo")}
          />
        </Tooltip>
        <Tooltip title={t("content_pages:EDITOR_TOOLBAR_REDO")}>
          <Button
            type="text"
            disabled={!actions.isEnabled("edit.redo")}
            icon={<Redo2 className="size-4" />}
            onClick={() => void actions.run("edit.redo")}
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
                title={t(`content_pages:EDITOR_DEVICE_${key.toUpperCase()}` as const)}
              >
                <Button
                  type={isActive ? "primary" : "default"}
                  icon={<Icon className="size-4" />}
                  onClick={() => {
                    // If the user has entered a custom width, clear it so presets always take effect.
                    setCanvasWidth(null);
                    setDevicePreset(key);
                  }}
                />
              </Tooltip>
            );
          })}
        </Space.Compact>

        {/* Canvas Settings Popover */}
        <Popover open={canvasSettingsOpen} onOpenChange={setCanvasSettingsOpen}>
          <PopoverTrigger asChild>
            <Button type="text" className="ml-1 gap-0.5! tabular-nums">
              <span className="text-callout text-secondary">{displayWidth} px</span>
              <ChevronDown className="size-3 text-label-secondary" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="center" className="w-64 space-y-3 p-3">
            <div>
              <p className="text-callout font-medium">
                {t("content_pages:EDITOR_CANVAS_SETTINGS_TITLE")}
              </p>
              <p className="text-caption text-label-secondary">
                {t("content_pages:EDITOR_CANVAS_SETTINGS_DESC")}
              </p>
            </div>

            {/* Width */}
            <label className="flex items-center gap-2 text-callout">
              <span className="w-16 shrink-0 text-label-secondary">
                {t("content_pages:EDITOR_CANVAS_SETTINGS_WIDTH")}
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
                {t("content_pages:EDITOR_CANVAS_SETTINGS_SCALE")}
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
            <Tooltip title={t("content_pages:EDITOR_COMING_SOON")}>
              <div className="flex flex-col gap-1.5 opacity-50">
                <span className="text-callout text-label-secondary">
                  {t("content_pages:EDITOR_CANVAS_SETTINGS_RULER")}
                </span>
                <Radio.Group value={rulerMode} disabled>
                  <div className="flex flex-col gap-1">
                    {RULER_OPTIONS.map((opt) => (
                      <Radio key={opt.value} value={opt.value}>
                        <span className="text-callout">{t(opt.labelKey)}</span>
                      </Radio>
                    ))}
                  </div>
                </Radio.Group>
              </div>
            </Tooltip>

            {/* Line guides — disabled, coming soon */}
            <Tooltip title={t("content_pages:EDITOR_COMING_SOON")}>
              <div className="opacity-50">
                <Checkbox checked={showLineGuides} disabled>
                  <span className="text-callout">
                    {t("content_pages:EDITOR_CANVAS_SETTINGS_LINE_GUIDES")}
                  </span>
                </Checkbox>
              </div>
            </Tooltip>
          </PopoverContent>
        </Popover>
      </div>

      {/* Right: Zoom controls */}
      <div className="flex items-center gap-1">
        <Tooltip title={t("content_pages:EDITOR_TOOLBAR_ZOOM_OUT")}>
          <Button
            type="text"
            disabled={!actions.isEnabled("view.zoom_out")}
            icon={<ZoomOut className="size-4" />}
            onClick={() => void actions.run("view.zoom_out")}
          />
        </Tooltip>

        <Dropdown menu={{ items: zoomMenuItems }} trigger={["click"]}>
          <Button type="text" className="gap-0.5! tabular-nums">
            <span className="text-callout text-label-secondary">{zoomPercent}%</span>
            <ChevronDown className="size-3 text-label-secondary" />
          </Button>
        </Dropdown>

        <Tooltip title={t("content_pages:EDITOR_TOOLBAR_ZOOM_IN")}>
          <Button
            type="text"
            disabled={!actions.isEnabled("view.zoom_in")}
            icon={<ZoomIn className="size-4" />}
            onClick={() => void actions.run("view.zoom_in")}
          />
        </Tooltip>

        <Tooltip title={t("content_pages:EDITOR_TOOLBAR_ZOOM_RESET")}>
          <Button
            type="text"
            disabled={!actions.isEnabled("view.zoom_reset")}
            icon={<RotateCcw className="size-4" />}
            onClick={() => void actions.run("view.zoom_reset")}
          />
        </Tooltip>
      </div>
    </div>
  );
}
