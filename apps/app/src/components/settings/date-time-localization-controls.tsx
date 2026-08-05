import { Switch } from "@arclayer/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";

import type { LocalizationOption } from "@/lib/settings/general/localization-options";

type LocalizationSwitchControlProps = {
  controlId: string;
  onSelectChange: (value: string) => void;
  onSwitchChange: (checked: boolean) => void;
  options: LocalizationOption[];
  selectValue: string;
  switchChecked: boolean;
  switchDescription: string;
  switchLabel: string;
  showSearch?: boolean;
};

function LocalizationSwitchControl(props: LocalizationSwitchControlProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-body text-label-primary">{props.switchLabel}</span>
        <Switch
          id={`${props.controlId}-switch`}
          name={`${props.controlId}Auto`}
          aria-label={props.switchLabel}
          checked={props.switchChecked}
          onCheckedChange={props.onSwitchChange}
        />
      </div>
      <div className="text-callout text-label-secondary">{props.switchDescription}</div>
      <Select
        name={props.controlId}
        value={props.selectValue}
        disabled={props.switchChecked}
        onValueChange={props.onSelectChange}
      >
        <SelectTrigger
          id={`${props.controlId}-select`}
          aria-label={props.switchLabel}
          className="w-full"
          size="default"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          {props.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function TimezoneLocalizationControl(props: LocalizationSwitchControlProps) {
  return <LocalizationSwitchControl {...props} showSearch />;
}

export function DateTimeFormatLocalizationControl(props: LocalizationSwitchControlProps) {
  return <LocalizationSwitchControl {...props} showSearch={false} />;
}
