import { Input } from "antd";

export function ModelRelationsEditor(props: {
  disabled?: boolean;
  value: string;
  onChange: (value: string) => void;
  translate: (key: string) => string;
}) {
  return (
    <div className="grid gap-1.5">
      <label className="font-semibold text-foreground">
        {props.translate("content_library:MODELS_SECTION_RELATIONS")}
      </label>
      <Input.TextArea
        rows={4}
        value={props.value}
        disabled={props.disabled}
        placeholder={props.translate("content_library:MODELS_JSON_PLACEHOLDER_RELATIONS")}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </div>
  );
}
