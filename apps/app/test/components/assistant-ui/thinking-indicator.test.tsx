import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ThinkingIndicator } from "@/components/assistant-ui/elements/thinking-indicator";

describe("ThinkingIndicator", () => {
  it("uses the assistant-ui Dot Matrix for the active state", () => {
    const { container } = render(<ThinkingIndicator label="正在思考" state="thinking" />);

    expect(
      container.querySelector('[data-slot="dot-matrix"][data-state="thinking"]'),
    ).toBeInTheDocument();
  });
});
