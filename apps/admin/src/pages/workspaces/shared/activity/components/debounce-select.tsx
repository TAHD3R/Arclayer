import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import debounce from "lodash/debounce";

import { UserAvatar } from "@/components/common/entity-avatar";
import { Button } from "@arclayer/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@arclayer/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@arclayer/ui/popover";
import { Spinner } from "@arclayer/ui/spinner";
import { cn } from "@arclayer/lib/utils";

export type DebounceSelectOption = {
  label: ReactNode;
  value: string | number;
  avatarUrl?: string | null;
};

function avatarFallbackText(label: ReactNode): string {
  if (typeof label === "string") {
    const v = label.trim();
    return v ? v.slice(0, 1).toUpperCase() : "?";
  }
  if (typeof label === "number") return String(label);
  return "?";
}

export interface DebounceSelectProps<ValueType extends DebounceSelectOption> {
  fetchOptions: (search: string) => Promise<ValueType[]>;
  debounceTimeout?: number;
  value?: ValueType;
  onChange?: (value?: ValueType) => void;
  allowClear?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  labelInValue?: boolean;
  emptyText?: string;
}

export function DebounceSelect<ValueType extends DebounceSelectOption = DebounceSelectOption>({
  fetchOptions,
  debounceTimeout = 300,
  value,
  onChange,
  allowClear,
  disabled,
  placeholder,
  className,
  emptyText = "No results",
}: DebounceSelectProps<ValueType>) {
  const [fetching, setFetching] = useState(false);
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ValueType[]>([]);
  const [search, setSearch] = useState("");
  const fetchRef = useRef(0);

  const loadOptions = useCallback(
    (value: string, opts?: { clear?: boolean }) => {
      fetchRef.current += 1;
      const fetchId = fetchRef.current;
      if (opts?.clear) setOptions([]);
      setFetching(true);

      fetchOptions(value)
        .then((newOptions) => {
          // 防止异步回写乱序：只接收最后一次请求的返回
          if (fetchId !== fetchRef.current) return;
          setOptions(newOptions);
          setFetching(false);
        })
        .catch(() => {
          if (fetchId !== fetchRef.current) return;
          setOptions([]);
          setFetching(false);
        });
    },
    [fetchOptions],
  );

  const debounceFetcher = useMemo(
    () => debounce((value: string) => loadOptions(value, { clear: true }), debounceTimeout),
    [debounceTimeout, loadOptions],
  );

  useEffect(() => {
    return () => {
      debounceFetcher.cancel();
    };
  }, [debounceFetcher]);

  useEffect(() => {
    if (!open || disabled) return;
    loadOptions(search, { clear: true });
  }, [disabled, loadOptions, open, search]);

  const triggerAvatar = value ? (
    <UserAvatar
      name={avatarFallbackText(value.label)}
      assetRef={value.avatarUrl}
      size={20}
      style={{ flexShrink: 0 }}
    />
  ) : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-left text-footnote  transition-colors outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            {triggerAvatar}
            <span className={cn("min-w-0 flex-1", !value && "text-label-secondary")}>
              {value?.label ?? placeholder}
            </span>
          </span>
          <span className="flex items-center gap-1">
            {allowClear && value ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setSearch("");
                  setOptions([]);
                  onChange?.(undefined);
                }}
              >
                <X className="size-3.5" />
              </Button>
            ) : null}
            <ChevronDown className="size-4 text-label-secondary" />
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-[min(var(--radix-popover-trigger-width),90vw)] min-w-[min(var(--radix-popover-trigger-width),90vw)] p-0"
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            placeholder={placeholder}
            onValueChange={(next) => {
              setSearch(next);
              debounceFetcher(next);
            }}
          />
          <CommandList className="max-h-72">
            {fetching ? (
              <div className="flex items-center justify-center py-4">
                <Spinner className="size-4 text-label-secondary" />
              </div>
            ) : null}
            {!fetching ? <CommandEmpty>{emptyText}</CommandEmpty> : null}
            {options.map((option) => {
              const isActive = option.value === value?.value;
              return (
                <CommandItem
                  key={String(option.value)}
                  value={String(option.value)}
                  onSelect={() => {
                    onChange?.(option);
                    setOpen(false);
                  }}
                >
                  <UserAvatar
                    name={avatarFallbackText(option.label)}
                    assetRef={option.avatarUrl}
                    size={24}
                    style={{ flexShrink: 0 }}
                  />
                  <span className="min-w-0 flex-1">{option.label}</span>
                  {isActive ? <Check className="size-4 text-primary" /> : null}
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
