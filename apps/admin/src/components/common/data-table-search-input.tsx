import { Search, X } from "@arclayer/ui/icons/lucide-animated";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@arclayer/ui/input-group";

type DataTableSearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  clearLabel: string;
  className?: string;
};

export function DataTableSearchInput({
  value,
  onChange,
  placeholder,
  clearLabel,
  className,
}: DataTableSearchInputProps) {
  return (
    <InputGroup className={className ?? "w-[min(100%,22.5rem)]"}>
      <InputGroupAddon>
        <Search className="size-4 text-label-secondary" />
      </InputGroupAddon>
      <InputGroupInput
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
      {value ? (
        <InputGroupAddon align="inline-end">
          <InputGroupButton aria-label={clearLabel} size="icon-xs" onClick={() => onChange("")}>
            <X className="size-3.5" />
          </InputGroupButton>
        </InputGroupAddon>
      ) : null}
    </InputGroup>
  );
}
