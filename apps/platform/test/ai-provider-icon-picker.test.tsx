import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AiProviderIconPicker } from "@/ai/ai-provider-icon-picker";

describe("AiProviderIconPicker", () => {
  it("selects a bundled provider icon", () => {
    const onChange = vi.fn();
    render(<AiProviderIconPicker onChange={onChange} value={{ lightUrl: null, darkUrl: null }} />);

    fireEvent.click(screen.getAllByRole("button", { name: "USE_PROVIDER_ICON" })[0]);

    expect(onChange).toHaveBeenCalledWith({
      lightUrl: "/provider-icons/openai.svg",
      darkUrl: "/provider-icons/openai-dark.svg",
    });
  });
});
