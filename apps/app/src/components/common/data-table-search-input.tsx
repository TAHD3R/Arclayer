import { useId } from "react";
import { Search, X } from "lucide-react";

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
  const inputId = useId();

  return (
    <InputGroup className={className ?? "w-[min(100%,22.5rem)]"}>
      <InputGroupAddon>
        <Search className="size-4 text-label-secondary" />
      </InputGroupAddon>
      <InputGroupInput
        id={inputId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={placeholder}
        placeholder={placeholder}
        className="truncate"
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
