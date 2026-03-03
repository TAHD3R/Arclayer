import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Avatar, Select } from "antd";
import type { SelectProps } from "antd";
import debounce from "lodash/debounce";

import { LoaderOne } from "@celestial/ui/loader";
import { resolveAssetRefToPublicUrlPath } from "@/lib/assets/asset-urls";

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

export interface DebounceSelectProps<ValueType extends DebounceSelectOption> extends Omit<
  SelectProps<ValueType | ValueType[]>,
  "options" | "children"
> {
  fetchOptions: (search: string) => Promise<ValueType[]>;
  debounceTimeout?: number;
}

export function DebounceSelect<ValueType extends DebounceSelectOption = DebounceSelectOption>({
  fetchOptions,
  debounceTimeout = 300,
  ...props
}: DebounceSelectProps<ValueType>) {
  const [fetching, setFetching] = useState(false);
  const [options, setOptions] = useState<ValueType[]>([]);
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

  return (
    <Select
      {...props}
      showSearch
      filterOption={false}
      onSearch={debounceFetcher}
      onDropdownVisibleChange={(open) => {
        props.onDropdownVisibleChange?.(open);
        // UX: 点开下拉就给候选项（无需先输入字符）
        if (open && options.length === 0) loadOptions("", { clear: false });
      }}
      onFocus={(e) => {
        props.onFocus?.(e);
        // 兜底：有些情况下 dropdown open 事件触发较晚/不稳定
        if (options.length === 0) loadOptions("", { clear: false });
      }}
      notFoundContent={fetching ? <LoaderOne /> : null}
      options={options}
      optionRender={(option) => (
        <div style={{ display: "flex", alignItems: "center" }}>
          <Avatar
            src={resolveAssetRefToPublicUrlPath(option.data.avatarUrl) || undefined}
            style={{
              marginRight: 8,
            }}
          >
            {avatarFallbackText(option.data.label)}
          </Avatar>
          {option.label}
        </div>
      )}
    />
  );
}
