import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useControlledState } from "@celestial/hooks/use-controlled-state";

describe("useControlledState", () => {
  it("受控模式下应以 value 为单一真相来源", () => {
    const onChange = vi.fn();

    const { result } = renderHook(() =>
      useControlledState({
        value: true,
        defaultValue: false,
        onChange,
      }),
    );

    expect(result.current[0]).toBe(true);

    act(() => {
      result.current[1](false);
    });

    expect(onChange).toHaveBeenCalledWith(false);
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
