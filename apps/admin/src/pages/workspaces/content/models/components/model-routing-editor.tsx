import { Input } from "antd";

export function ModelRoutingEditor(props: {
  disabled?: boolean;
  mode: string;
  pattern: string;
  onModeChange: (value: string) => void;
  onPatternChange: (value: string) => void;
  translate: (key: string) => string;
}) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <label className="font-semibold text-foreground">
          {props.translate("content_library:MODELS_ROUTING_MODE_LABEL")}
        </label>
        <Input
          disabled={props.disabled}
          value={props.mode}
          placeholder="none | slug_only | static_or_dynamic"
          onChange={(event) => props.onModeChange(event.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <label className="font-semibold text-foreground">
          {props.translate("content_library:MODELS_ROUTING_PATTERN_LABEL")}
        </label>
        <Input
          disabled={props.disabled}
          value={props.pattern}
          placeholder="/blog/:slug"
          onChange={(event) => props.onPatternChange(event.target.value)}
        />
      </div>
    </div>
  );
}
