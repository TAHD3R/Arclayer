import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { AIModelBrandIcon } from "@/components/ai/ai-model-brand-icons";
import { usePreferencesStore } from "@/stores/use-preference-store";

describe("AIModelBrandIcon", () => {
  beforeEach(() => {
    usePreferencesStore.setState({ themeMode: "light", themePreference: "light" });
  });

  it("uses a generic icon for an unknown provider without configured artwork", () => {
    const { container } = render(
      <AIModelBrandIcon provider="custom-provider" modelId="custom-model" />,
    );

    expect(container.querySelector(".lucide-boxes")).toBeInTheDocument();
    expect(container.querySelector("img")).not.toBeInTheDocument();
  });
});
