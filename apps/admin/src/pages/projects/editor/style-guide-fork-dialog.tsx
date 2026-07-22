import { useEffect, useState } from "react";
import { CircleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Alert, AlertDescription } from "@arclayer/ui/alert";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { Textarea } from "@arclayer/ui/textarea";
import type { StyleGuideForkInput } from "@/pages/projects/editor/use-project-style-guide-controller";

interface StyleGuideForkDialogProps {
  open: boolean;
  projectName: string;
  pending: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: StyleGuideForkInput) => void;
}

export function StyleGuideForkDialog(props: StyleGuideForkDialogProps) {
  const { t } = useTranslation(["account", "common"]);
  const formId = "creation-editor-style-guide-fork";
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!props.open) return;
    setName(t("account:CREATION_EDITOR_STYLE_FORK_NAME_DEFAULT", { project: props.projectName }));
    setDescription(t("account:CREATION_EDITOR_STYLE_FORK_DESCRIPTION_DEFAULT"));
  }, [props.open, props.projectName, t]);

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t("account:CREATION_EDITOR_STYLE_FORK_TITLE")}
      description={t("account:CREATION_EDITOR_STYLE_FORK_DESC")}
      preventInitialFocus={false}
      footer={
        <>
          <Button
            className="min-h-11 sm:min-h-9"
            variant="ghost"
            disabled={props.pending}
            onClick={() => props.onOpenChange(false)}
          >
            {t("common:CANCEL")}
          </Button>
          <Button
            className="min-h-11 sm:min-h-9"
            type="submit"
            form={formId}
            loading={props.pending}
          >
            {t("account:CREATION_EDITOR_STYLE_FORK_ACTION")}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          const normalizedName = name.trim();
          if (!normalizedName) return;
          props.onSubmit({ name: normalizedName, description: description.trim() || null });
        }}
      >
        <SettingDialogFields>
          {props.error ? (
            <Alert variant="destructive">
              <CircleAlert aria-hidden="true" />
              <AlertDescription>{props.error}</AlertDescription>
            </Alert>
          ) : null}
          <SettingDialogField
            title={
              <label htmlFor={`${formId}-name`}>
                {t("account:CREATION_EDITOR_STYLE_FORK_NAME_LABEL")}
              </label>
            }
          >
            <Input
              id={`${formId}-name`}
              autoFocus
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </SettingDialogField>
          <SettingDialogField
            title={
              <label htmlFor={`${formId}-description`}>
                {t("account:CREATION_EDITOR_STYLE_FORK_DESCRIPTION_LABEL")}
              </label>
            }
            description={t("account:CREATION_EDITOR_STYLE_FORK_DESCRIPTION_HELP")}
          >
            <Textarea
              id={`${formId}-description`}
              className="min-h-24"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </SettingDialogField>
        </SettingDialogFields>
      </form>
    </SettingDialog>
  );
}
