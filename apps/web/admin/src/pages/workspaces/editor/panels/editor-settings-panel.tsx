import { InputNumber, Switch } from "antd";
import { useTranslation } from "react-i18next";

import { SettingAccordionItem } from "@/components/common/setting-accordion-item";
import { Accordion } from "@/components/ui/accordion";
import { useEditorStore } from "@/pages/workspaces/editor/stores/editor-store";

export function EditorSettingsPanel() {
  const { t } = useTranslation(["content_pages"]);

  const autoSaveEnabled = useEditorStore((s) => s.autoSaveEnabled);
  const autoSaveIntervalSec = useEditorStore((s) => s.autoSaveIntervalSec);
  const saveOnBlur = useEditorStore((s) => s.saveOnBlur);
  const setAutoSaveEnabled = useEditorStore((s) => s.setAutoSaveEnabled);
  const setAutoSaveIntervalSec = useEditorStore((s) => s.setAutoSaveIntervalSec);
  const setSaveOnBlur = useEditorStore((s) => s.setSaveOnBlur);

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Panel header */}
      <div className="flex flex-col gap-1">
        <h2 className="text-title3 font-bold">{t("content_pages:EDITOR_V2_SETTINGS_TITLE")}</h2>
        <p className="text-caption text-label-secondary">
          {t("content_pages:EDITOR_V2_SETTINGS_DESCRIPTION")}
        </p>
      </div>

      {/* Auto-save settings */}
      <Accordion type="single" collapsible defaultValue="autoSave">
        <SettingAccordionItem
          value="autoSave"
          title={t("content_pages:EDITOR_V2_SETTINGS_AUTOSAVE_TITLE")}
          description={t("content_pages:EDITOR_V2_SETTINGS_AUTOSAVE_DESC")}
        >
          <div className="flex flex-col gap-4">
            {/* Enable auto-save */}
            <div className="flex items-center justify-between">
              <span className="text-callout">
                {t("content_pages:EDITOR_V2_SETTINGS_AUTOSAVE_ENABLED")}
              </span>
              <Switch checked={autoSaveEnabled} onChange={setAutoSaveEnabled} />
            </div>

            {/* Save interval */}
            <div className="flex items-center justify-between">
              <span className="text-callout">
                {t("content_pages:EDITOR_V2_SETTINGS_AUTOSAVE_INTERVAL")}
              </span>
              <InputNumber
                min={10}
                max={300}
                value={autoSaveIntervalSec}
                onChange={(val) => {
                  if (val !== null) setAutoSaveIntervalSec(val);
                }}
                disabled={!autoSaveEnabled}
              />
            </div>

            {/* Save on blur */}
            <div className="flex items-center justify-between">
              <span className="text-callout">
                {t("content_pages:EDITOR_V2_SETTINGS_AUTOSAVE_BLUR")}
              </span>
              <Switch checked={saveOnBlur} onChange={setSaveOnBlur} />
            </div>
          </div>
        </SettingAccordionItem>
      </Accordion>
    </div>
  );
}
