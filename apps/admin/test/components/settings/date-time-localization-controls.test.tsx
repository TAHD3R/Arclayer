import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  DateTimeFormatLocalizationControl,
  TimezoneLocalizationControl,
} from "@/components/settings/date-time-localization-controls";

describe("date-time-localization-controls", () => {
  it("disables timezone selection when browser timezone mode is enabled", () => {
    render(
      <TimezoneLocalizationControl
        selectValue="America/Denver"
        switchChecked
        switchDescription="Use browser timezone"
        switchLabel="Auto timezone"
        onSelectChange={() => undefined}
        onSwitchChange={() => undefined}
        options={[{ value: "America/Denver", label: "America/Denver" }]}
      />,
    );

    const select = screen.getByRole("combobox");

    expect(screen.getByRole("switch")).toBeInTheDocument();
    expect(select).toBeDisabled();
  });

  it("disables date format selection when relative datetime mode is enabled", () => {
    render(
      <DateTimeFormatLocalizationControl
        selectValue="FULL_DATE_TIME"
        switchChecked
        switchDescription="Use relative datetime"
        switchLabel="Relative datetime"
        onSelectChange={() => undefined}
        onSwitchChange={() => undefined}
        options={[{ value: "FULL_DATE_TIME", label: "Full date and time" }]}
      />,
    );

    const select = screen.getByRole("combobox");

    expect(screen.getByRole("switch")).toBeInTheDocument();
    expect(select).toBeDisabled();
  });
});
