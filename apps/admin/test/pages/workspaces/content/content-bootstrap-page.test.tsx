import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { ContentBootstrapPage } from "@/pages/workspaces/content/bootstrap/page";

const mocked = vi.hoisted(() => ({
  useContentBootstrapController: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/pages/workspaces/content/bootstrap/hooks/use-content-bootstrap-controller", () => ({
  useContentBootstrapController: mocked.useContentBootstrapController,
}));

describe("ContentBootstrapPage", () => {
  test("renders a single-step create form with start-from options", () => {
    mocked.useContentBootstrapController.mockReturnValue({
      title: "",
      selectedPresetKey: null,
      busy: false,
      continuePending: false,
      canContinue: false,
      setTitle: vi.fn(),
      setLocale: vi.fn(),
      continueWithStarter: vi.fn(),
      navigateToLibrary: vi.fn(),
      selectPreset: vi.fn(),
    });

    render(<ContentBootstrapPage workspaceId="ws-1" />);

    expect(screen.getByText("CONTENT_BOOTSTRAP_CREATE_TITLE")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_BOOTSTRAP_FIELD_TITLE_LABEL")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_BOOTSTRAP_START_WITH_LABEL")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_BOOTSTRAP_PRESET_PAGE_NAME")).toBeInTheDocument();
    expect(screen.queryByText("CONTENT_BOOTSTRAP_PRESET_BLANK_NAME")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "CONTENT_BOOTSTRAP_ACTION_SKIP" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "CONTENT_BOOTSTRAP_ACTION_CONTINUE" }),
    ).toBeDisabled();
    expect(screen.getByText("CONTENT_BOOTSTRAP_START_FROM_DESC")).toBeInTheDocument();
    expect(
      screen.queryByText("CONTENT_BOOTSTRAP_ACTION_CONTINUE_TO_EDITOR"),
    ).not.toBeInTheDocument();
  });

  test("reflects the selected start-from template", () => {
    mocked.useContentBootstrapController.mockReturnValue({
      title: "My draft",
      selectedPresetKey: "post",
      busy: false,
      continuePending: false,
      canContinue: true,
      setTitle: vi.fn(),
      setLocale: vi.fn(),
      continueWithStarter: vi.fn(),
      navigateToLibrary: vi.fn(),
      selectPreset: vi.fn(),
    });

    render(<ContentBootstrapPage workspaceId="ws-1" />);

    expect(screen.getByText("CONTENT_BOOTSTRAP_CREATE_TITLE")).toBeInTheDocument();
    expect(screen.getByDisplayValue("My draft")).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: /CONTENT_BOOTSTRAP_PRESET_POST_NAME/i }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "CONTENT_BOOTSTRAP_ACTION_SKIP" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "CONTENT_BOOTSTRAP_ACTION_CONTINUE" })).toBeEnabled();
    expect(
      screen.getByText(
        (_, node) =>
          node?.textContent ===
          [
            "CONTENT_BOOTSTRAP_START_FROM_DESC",
            "CONTENT_BOOTSTRAP_START_CURRENT_TEMPLATE_PREFIX",
            "CONTENT_BOOTSTRAP_PRESET_POST_NAME",
          ].join(""),
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText("CONTENT_BOOTSTRAP_PRESET_POST_NAME")).toHaveLength(2);
  });
});
