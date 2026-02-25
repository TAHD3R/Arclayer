import { InputNumber, Switch } from "antd";
import { useTranslation } from "react-i18next";

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
      <div className="flex flex-col gap-1">
        <h2 className="text-title3 font-bold">
          {t("content_pages:EDITOR_V2_SAVE_SETTINGS_TITLE")}
        </h2>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-callout">
            {t("content_pages:EDITOR_V2_SAVE_SETTINGS_AUTO_SAVE")}
          </span>
          <Switch checked={autoSaveEnabled} onChange={setAutoSaveEnabled} />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-callout">
            {t("content_pages:EDITOR_V2_SAVE_SETTINGS_INTERVAL")}
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

        <div className="flex items-center justify-between">
          <span className="text-callout">
            {t("content_pages:EDITOR_V2_SAVE_SETTINGS_SAVE_ON_BLUR")}
          </span>
          <Switch checked={saveOnBlur} onChange={setSaveOnBlur} />
        </div>
      </div>
    </div>
  );
}
