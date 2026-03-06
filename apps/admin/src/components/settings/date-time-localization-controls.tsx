import { Select, Switch } from "antd";

import type { LocalizationOption } from "@/lib/settings/general/localization-options";

type LocalizationSwitchControlProps = {
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
        <Switch checked={props.switchChecked} onChange={props.onSwitchChange} />
      </div>
      <div className="text-callout text-label-secondary">{props.switchDescription}</div>
      <Select
        size="large"
        value={props.selectValue}
        disabled={props.switchChecked}
        options={props.options}
        showSearch={props.showSearch}
        optionFilterProp={props.showSearch ? "label" : undefined}
        onChange={(value) => props.onSelectChange(String(value))}
      />
    </div>
  );
}

export function TimezoneLocalizationControl(props: LocalizationSwitchControlProps) {
  return <LocalizationSwitchControl {...props} showSearch />;
}

export function DateTimeFormatLocalizationControl(props: LocalizationSwitchControlProps) {
  return <LocalizationSwitchControl {...props} showSearch={false} />;
}
