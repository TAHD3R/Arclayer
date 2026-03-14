import { describe, expect, it } from "vitest";

import enUS from "../../../../locales/en-US/content_library.json";
import zhCN from "../../../../locales/zh-CN/content_library.json";

const REQUIRED_MODEL_KEYS = [
  "MODELS_COMPARE_ACTION",
  "MODELS_HEALTH_ACTION",
  "MODELS_PANEL_LIST_TITLE",
  "MODELS_PANEL_LIST_DESC",
  "MODELS_PANEL_WORKSPACE_TITLE",
  "MODELS_PANEL_WORKSPACE_DESC",
  "MODELS_PANEL_INSPECTOR_TITLE",
  "MODELS_PANEL_INSPECTOR_DESC",
  "MODELS_EMPTY_WORKSPACE_TITLE",
  "MODELS_EMPTY_WORKSPACE_DESC",
  "MODELS_EMPTY_INSPECTOR_TITLE",
  "MODELS_EMPTY_INSPECTOR_DESC",
  "MODELS_SECTION_DEFAULTS",
  "MODELS_IMPORT_ACTION",
  "MODELS_IMPORT_DIALOG_TITLE",
  "MODELS_IMPORT_DIALOG_DESC",
  "MODELS_IMPORT_DIALOG_CONFIRM",
  "MODELS_IMPORT_SELECTED_PREFIX",
  "MODELS_IMPACT_STATUS_TITLE",
  "MODELS_IMPACT_STATUS_WARN",
  "MODELS_IMPACT_STATUS_CLEAN",
  "MODELS_IMPACT_USAGE_RECORDS",
  "MODELS_IMPACT_USAGE_ROUTES",
  "MODELS_IMPACT_USAGE_PRESENTATIONS",
  "MODELS_IMPACT_USAGE_PUBLISH",
];

describe("content_library model locales", () => {
  it.each([
    ["en-US", enUS],
    ["zh-CN", zhCN],
  ])("contains the rebuilt models page copy for %s", (_locale, messages) => {
    for (const key of REQUIRED_MODEL_KEYS) {
      expect(messages[key as keyof typeof messages]).toBeTypeOf("string");
      expect(messages[key as keyof typeof messages]).not.toBe("");
    }
  });
});
