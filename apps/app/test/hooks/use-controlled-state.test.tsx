import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useControlledState } from "@arclayer/hooks/use-controlled-state";

describe("useControlledState", () => {
  it("受控模式下应立即反映 next 值，并在父组件接受更新后保持同步", () => {
    const onChange = vi.fn();

    const { result, rerender } = renderHook(
      ({ value }: { value: boolean }) =>
        useControlledState({
          value,
          defaultValue: false,
          onChange,
        }),
      { initialProps: { value: true } },
    );

    expect(result.current[0]).toBe(true);

    act(() => {
      result.current[1](false);
    });

    expect(onChange).toHaveBeenCalledWith(false);
    expect(result.current[0]).toBe(false);

    rerender({ value: true });

    expect(result.current[0]).toBe(true);

    rerender({ value: false });

    expect(result.current[0]).toBe(false);
  });

  it("受控模式下若父组件拒绝更新，应在下一次渲染时回滚到外部 value", () => {
    const onChange = vi.fn();

    const { result, rerender } = renderHook(
      ({ value }: { value: boolean }) =>
        useControlledState({
          value,
          defaultValue: false,
          onChange,
        }),
      { initialProps: { value: true } },
    );

    act(() => {
      result.current[1](false);
    });

    expect(result.current[0]).toBe(false);
    expect(onChange).toHaveBeenCalledWith(false);

    rerender({ value: true });

    expect(result.current[0]).toBe(true);
  });

  it("非受控模式下应更新内部状态", () => {
    const onChange = vi.fn();

    const { result } = renderHook(() =>
      useControlledState({
        defaultValue: false,
        onChange,
      }),
    );

    expect(result.current[0]).toBe(false);

    act(() => {
      result.current[1](true);
    });

    expect(onChange).toHaveBeenCalledWith(true);
    expect(result.current[0]).toBe(true);
  });
});
