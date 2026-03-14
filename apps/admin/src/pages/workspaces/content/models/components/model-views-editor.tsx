import { Checkbox, Input } from "antd";

export function ModelViewsEditor(props: {
  disabled?: boolean;
  defaultEditor: string;
  defaultView: string;
  workflowSupportsSchedule: boolean;
  onDefaultEditorChange: (value: string) => void;
  onDefaultViewChange: (value: string) => void;
  onWorkflowScheduleChange: (value: boolean) => void;
  translate: (key: string) => string;
}) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <label className="font-semibold text-foreground">
          {props.translate("content_library:MODELS_VIEW_DEFAULT_EDITOR_LABEL")}
        </label>
        <Input
          disabled={props.disabled}
          value={props.defaultEditor}
          placeholder="form | visual | rich_text | table"
          onChange={(event) => props.onDefaultEditorChange(event.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <label className="font-semibold text-foreground">
          {props.translate("content_library:MODELS_VIEW_DEFAULT_LABEL")}
        </label>
        <Input
          disabled={props.disabled}
          value={props.defaultView}
          placeholder="table"
          onChange={(event) => props.onDefaultViewChange(event.target.value)}
        />
      </div>
      <Checkbox
        disabled={props.disabled}
        checked={props.workflowSupportsSchedule}
        onChange={(event) => props.onWorkflowScheduleChange(event.target.checked)}
      >
        {props.translate("content_library:MODELS_WORKFLOW_SCHEDULE_LABEL")}
      </Checkbox>
    </div>
  );
}
