import { Switch } from "@celestial/ui/switch";

import { cn } from "@celestial/lib/utils";

type SettingSwitchBlockProps = {
  checked: boolean;
  description: string;
  disabled?: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
};

export function SettingSwitchBlock(props: SettingSwitchBlockProps) {
  return (
    <div className={cn("flex flex-col gap-2", props.className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-body text-label-primary">{props.label}</span>
        <Switch
          checked={props.checked}
          disabled={props.disabled}
          onCheckedChange={props.onCheckedChange}
        />
      </div>
      <div className="text-callout text-label-secondary">{props.description}</div>
    </div>
  );
}
