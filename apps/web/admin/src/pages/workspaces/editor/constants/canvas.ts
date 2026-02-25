import type { DevicePreset } from "@/pages/workspaces/editor/stores/editor-store";

export const DEVICE_PRESET_WIDTHS: Record<DevicePreset, number> = {
  desktop: 1440,
  tablet: 768,
  mobile: 375,
} as const;
