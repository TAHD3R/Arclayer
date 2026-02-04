import type { ReactNode } from "react";
import { useMemo, useRef, useState } from "react";
import { Avatar, Select, Spin } from "antd";
import type { SelectProps } from "antd";
import debounce from "lodash/debounce";

export type DebounceSelectOption = {
  label: ReactNode;
  value: string | number;
  avatarUrl?: string | null;
};

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

  const debounceFetcher = useMemo(() => {
    const loadOptions = (value: string) => {
      fetchRef.current += 1;
      const fetchId = fetchRef.current;
      setOptions([]);
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
    };

    return debounce(loadOptions, debounceTimeout);
  }, [fetchOptions, debounceTimeout]);

  return (
    <Select
      showSearch
      filterOption={false}
      onSearch={debounceFetcher}
      notFoundContent={fetching ? <Spin size="small" /> : null}
      {...props}
      options={options}
      optionRender={(option) => (
        <div style={{ display: "flex", alignItems: "center" }}>
          {option.data.avatarUrl ? (
            <Avatar src={option.data.avatarUrl} style={{ marginRight: 8 }} />
          ) : null}
          {option.label}
        </div>
      )}
    />
  );
}
