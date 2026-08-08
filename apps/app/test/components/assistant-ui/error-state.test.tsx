import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ErrorState } from "@/components/assistant-ui/elements/error-state";

describe("ErrorState", () => {
  it("places the retry action below the error description", () => {
    render(
      <ErrorState
        title="Conversation unavailable"
        detail="Try again to continue."
        retrying={false}
        retryAction={<button type="button">Regenerate</button>}
      />,
    );

    const action = screen.getByRole("button", { name: "Regenerate" });
    expect(action.parentElement).toHaveClass("mt-2", "flex");
    expect(action.parentElement?.parentElement).toHaveClass("min-w-0", "flex-1");
  });
});
