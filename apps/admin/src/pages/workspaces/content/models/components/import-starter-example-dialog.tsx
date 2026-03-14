import { Button } from "antd";
import { useMemo, useState } from "react";

import { SettingDialog } from "@celestial/ui/setting-dialog";

import {
  LEGACY_CONTENT_MODEL_TEMPLATE_PRESETS,
  type LegacyContentModelTemplateId,
} from "./content-model-templates";

function buildCardClass(selected: boolean): string {
  return selected
    ? "rounded-2xl border border-primary bg-primary/5 p-4 text-left"
    : "rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/30";
}

function StarterDialogFooter(props: {
  disabled: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  translate: (key: string) => string;
}) {
  return (
    <>
      <Button type="text" autoInsertSpace={false} onClick={props.onCancel}>
        {props.translate("common:CANCEL")}
      </Button>
      <Button
        type="primary"
        autoInsertSpace={false}
        disabled={props.disabled}
        onClick={props.onConfirm}
      >
        {props.translate("content_library:MODELS_IMPORT_DIALOG_CONFIRM")}
      </Button>
    </>
  );
}

export function ImportStarterExampleDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (starterId: LegacyContentModelTemplateId) => void;
  translate: (key: string) => string;
}) {
  const starterOptions = useMemo(
    () => LEGACY_CONTENT_MODEL_TEMPLATE_PRESETS.filter((preset) => preset.id !== "custom"),
    [],
  );
  const [selectedId, setSelectedId] = useState<LegacyContentModelTemplateId | null>(null);

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setSelectedId(null);
        }
        props.onOpenChange(nextOpen);
      }}
      title={props.translate("content_library:MODELS_IMPORT_DIALOG_TITLE")}
      description={props.translate("content_library:MODELS_IMPORT_DIALOG_DESC")}
      footer={
        <StarterDialogFooter
          disabled={!selectedId}
          onCancel={() => props.onOpenChange(false)}
          onConfirm={() => {
            if (!selectedId) return;
            props.onConfirm(selectedId);
            setSelectedId(null);
          }}
          translate={props.translate}
        />
      }
    >
      <div className="grid gap-3 py-2 md:grid-cols-2">
        {starterOptions.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={buildCardClass(selectedId === preset.id)}
            onClick={() => setSelectedId(preset.id)}
          >
            <div className="text-body font-medium text-foreground">
              {props.translate(preset.titleKey)}
            </div>
            <div className="mt-1 text-footnote text-label-secondary">
              {props.translate(preset.summaryKey)}
            </div>
          </button>
        ))}
      </div>
    </SettingDialog>
  );
}
