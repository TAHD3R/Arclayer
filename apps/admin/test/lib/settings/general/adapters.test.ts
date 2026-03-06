import { describe, expect, it } from "vitest";

import { buildGeneralSettingsInitialValues } from "@/lib/settings/general/adapters";

describe("buildGeneralSettingsInitialValues", () => {
  it("defaults site localization switches to enabled when fields are missing", () => {
    const values = buildGeneralSettingsInitialValues({
      workspace: {
        namespace: "workspace.core",
        value: {
          site_localization: {
            timezone: "Asia/Shanghai",
            date_format: "YYYY-MM-DD",
          },
        },
      },
    });

    expect(values.useBrowserTimeZone).toBe(true);
    expect(values.useRelativeDateTime).toBe(true);
  });

  it("preserves explicit site localization switch values", () => {
    const values = buildGeneralSettingsInitialValues({
      workspace: {
        namespace: "workspace.core",
        value: {
          site_localization: {
            timezone: "Europe/Berlin",
            date_format: "DD/MM/YYYY",
            use_browser_timezone: false,
            use_relative_datetime: false,
          },
        },
      },
    });

    expect(values.useBrowserTimeZone).toBe(false);
    expect(values.useRelativeDateTime).toBe(false);
  });
});
