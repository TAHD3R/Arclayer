import { Button } from "antd";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { CreateContentModelInput } from "@/api/content-models";
import { ComplexDialog } from "@celestial/ui/complex-dialog";
import { cn } from "@celestial/lib/utils";

import { ImportStarterExampleDialog } from "./import-starter-example-dialog";
import {
  buildCreateInputFromDraft,
  buildDraftFromStarter,
  createBlankDraft,
  type ModelEditorDraft,
} from "./model-editor-draft";
import { ModelEditorShell } from "./model-editor-shell";

function DialogFooter(props: {
  canSubmit: boolean;
  confirmLoading?: boolean;
  onCancel: () => void;
  onSubmit: () => Promise<void>;
  translate: (key: string) => string;
}) {
  return (
    <>
      <Button
        type="text"
        autoInsertSpace={false}
        disabled={props.confirmLoading}
        onClick={props.onCancel}
      >
        {props.translate("common:CANCEL")}
      </Button>
      <Button
        type="primary"
        autoInsertSpace={false}
        icon={<Plus className="size-4" aria-hidden="true" />}
        loading={props.confirmLoading}
        disabled={!props.canSubmit}
        onClick={props.onSubmit}
      >
        {props.translate("content_library:MODELS_DIALOG_SUBMIT")}
      </Button>
    </>
  );
}

export function CreateContentModelDialog(props: {
  open: boolean;
  confirmLoading?: boolean;
  openImportOnOpen?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: CreateContentModelInput) => Promise<void>;
}) {
  const { t } = useTranslation(["content_library", "common"]);
  const [draft, setDraft] = useState<ModelEditorDraft>(() => createBlankDraft());
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  useEffect(() => {
    if (props.open) {
      setDraft(createBlankDraft());
      setImportDialogOpen(props.openImportOnOpen === true);
    }
  }, [props.open, props.openImportOnOpen]);

  const canSubmit = useMemo(() => {
    if (props.confirmLoading) return false;
    return draft.key.trim().length > 0 && draft.name.trim().length > 0;
  }, [draft.key, draft.name, props.confirmLoading]);

  const handleSubmit = async () => {
    await props.onConfirm(buildCreateInputFromDraft(draft));
  };

  return (
    <>
      <ComplexDialog
        open={props.open}
        onOpenChange={props.onOpenChange}
        size="xl"
        title={t("content_library:MODELS_DIALOG_TITLE")}
        description={t("content_library:MODELS_DIALOG_DESC")}
        contentClassName={cn(
          "rounded-[14px]",
          "w-[90vw]! max-w-[1400px]!",
          "h-[calc(100%-100px)]! max-h-[calc(100%-100px)]!",
          "[&>div]:h-full [&>div]:min-h-0",
        )}
        bodyClassName="overflow-hidden bg-muted/25 p-0!"
        footerClassName="border-t border-border/80 bg-card px-6 py-4"
        footer={
          <DialogFooter
            canSubmit={canSubmit}
            confirmLoading={props.confirmLoading}
            onCancel={() => props.onOpenChange(false)}
            onSubmit={handleSubmit}
            translate={t}
          />
        }
      >
        <div className="flex h-full min-h-0 flex-col bg-background">
          <div className="flex min-h-0 flex-1 overflow-auto px-6 py-5">
            <div className="mx-auto flex w-full max-w-[1320px] min-w-0 flex-col">
              <ModelEditorShell
                disabled={props.confirmLoading}
                draft={draft}
                onDraftChange={setDraft}
                onImportStarter={() => setImportDialogOpen(true)}
                translate={t}
              />
            </div>
          </div>
        </div>
      </ComplexDialog>

      <ImportStarterExampleDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onConfirm={(starterId) => {
          setDraft(buildDraftFromStarter(starterId, t));
          setImportDialogOpen(false);
        }}
        translate={t}
      />
    </>
  );
}
