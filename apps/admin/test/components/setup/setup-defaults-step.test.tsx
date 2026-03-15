import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { SetupDefaultsStep } from "@/components/setup/setup-defaults-step";
import type { SetupDefaultsDraft } from "@/types/stores";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

function SetupDefaultsStepHarness(props: { initialValues: Partial<SetupDefaultsDraft> }) {
  const form = useForm<SetupDefaultsDraft>({
    defaultValues: {
      timezone: "Asia/Shanghai",
      locale: "zh-CN",
      dateFormat: "YYYY-MM-DD",
      useBrowserTimeZone: false,
      useRelativeDateTime: false,
      ...props.initialValues,
    },
  });

  useEffect(() => {
    form.reset({
      timezone: "Asia/Shanghai",
      locale: "zh-CN",
      dateFormat: "YYYY-MM-DD",
      useBrowserTimeZone: false,
      useRelativeDateTime: false,
      ...props.initialValues,
    });
  }, [form, props.initialValues]);

  return <SetupDefaultsStep form={form} />;
}

describe("SetupDefaultsStep", () => {
  it("renders automatic timezone and relative datetime switches", () => {
    render(
      <SetupDefaultsStepHarness
        initialValues={{
          useBrowserTimeZone: true,
          useRelativeDateTime: true,
        }}
      />,
    );

    expect(screen.getAllByRole("switch")).toHaveLength(2);
  });

  it("disables manual timezone and date format selects when switches are enabled", async () => {
    const user = userEvent.setup();

    render(
      <SetupDefaultsStepHarness
        initialValues={{
          useBrowserTimeZone: false,
          useRelativeDateTime: false,
        }}
      />,
    );

    const [timezoneSelect, _localeSelect, dateFormatSelect] = screen.getAllByRole("combobox");
    const [timezoneSwitch, dateFormatSwitch] = screen.getAllByRole("switch");

    await user.click(timezoneSwitch);
    await user.click(dateFormatSwitch);

    expect(timezoneSelect).toBeDisabled();
    expect(dateFormatSelect).toBeDisabled();
  });
});
