import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { ButtonGroupText } from "@arclayer/ui/button-group";

describe("ButtonGroupText", () => {
  test("renders a stable border color for grouped filter labels", () => {
    render(<ButtonGroupText>状态</ButtonGroupText>);

    expect(screen.getByText("状态").className).toContain("border-input");
  });
});
