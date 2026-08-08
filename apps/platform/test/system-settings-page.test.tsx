import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { initializePlatformI18n, i18n } from "@/lib/i18n";
import { SystemSettingsPage } from "@/pages/system-settings";
import {
  createPlatformLanguageDraft,
  getPlatformSystemSettings,
  previewPlatformLanguageDraft,
  publishPlatformLanguageDraft,
  updatePlatformSystemSettingsSection,
} from "@/settings/system-settings-api";

vi.mock("@/settings/system-settings-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/settings/system-settings-api")>();
  return {
    ...actual,
    createPlatformLanguageDraft: vi.fn(),
    getPlatformSystemSettings: vi.fn(),
    previewPlatformLanguageDraft: vi.fn(),
    publishPlatformLanguageDraft: vi.fn(),
    updatePlatformSystemSettingsSection: vi.fn(),
  };
});

const settings = {
  revision: 4,
  identity: {
    instance_name: "Arclayer Cloud",
    description: "Cloud deployment",
    contact_email: "support@example.com",
    logo_url: null,
    favicon_url: null,
  },
  domains: {
    primary_domain: "example.com",
    console_domain: "platform.example.com",
    reserved_labels: ["www", "platform", "api"],
  },
  languages: [
    {
      locale: "zh-CN",
      language_name: "Simplified Chinese",
      native_name: "简体中文",
      flag_code: "cn",
      enabled: true,
      is_default: true,
      sort_order: 0,
      bundle_ready: true,
    },
    {
      locale: "en-US",
      language_name: "English (United States)",
      native_name: "English",
      flag_code: "us",
      enabled: true,
      is_default: false,
      sort_order: 1,
      bundle_ready: true,
    },
  ],
  regional: { timezone: "Asia/Shanghai", date_format: "YYYY-MM-DD", number_format: "1,234.56" },
  site_metadata: {
    default_title: "Arclayer Cloud",
    title_format: "Page title · Site name",
    default_description: "Default site description",
  },
  sections: [
    {
      id: "security",
      title: "Security",
      fields: [],
      values: { session_timeout: 3600 },
      secret_keys: [],
      editable: true,
    },
  ],
} as const;

beforeAll(async () => {
  await initializePlatformI18n("en-US");
});

beforeEach(async () => {
  await i18n.changeLanguage("en-US");
  vi.mocked(getPlatformSystemSettings).mockResolvedValue(settings);
  vi.mocked(updatePlatformSystemSettingsSection).mockResolvedValue({
    ...settings,
    revision: 5,
    identity: { ...settings.identity, instance_name: "Arclayer Enterprise" },
  });
  vi.mocked(createPlatformLanguageDraft).mockResolvedValue({
    draft_revision: 5,
    status: "draft",
    enabled_locales: ["zh-CN", "en-US"],
    default_locale: "zh-CN",
    bundle_ready: true,
  });
  vi.mocked(previewPlatformLanguageDraft).mockResolvedValue({
    draft_revision: 5,
    affected_surfaces: ["platform-console", "platform-api", "platform-openapi"],
    requires_product_todo: true,
    ready_to_publish: true,
  });
  vi.mocked(publishPlatformLanguageDraft).mockResolvedValue({ ...settings, revision: 5 });
});

describe("System settings page", () => {
  it("renders the deployment-wide settings shell and opens a real edit dialog", async () => {
    const user = userEvent.setup();
    render(<SystemSettingsPage />);

    expect(await screen.findByRole("heading", { name: "System settings" })).toBeVisible();

    const instanceName = await screen.findByPlaceholderText("For example, Arclayer Cloud");
    expect(instanceName).toBeDisabled();
    expect(await screen.findByPlaceholderText("support@example.com")).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Edit these settings" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeVisible();
    expect(within(dialog).getByDisplayValue("Arclayer Cloud")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });

  it("sends revisioned identity changes through the System Settings API", async () => {
    const user = userEvent.setup();
    render(<SystemSettingsPage />);

    await user.click(await screen.findByRole("button", { name: "Edit these settings" }));
    const dialog = screen.getByRole("dialog");
    const editableName = within(dialog).getByDisplayValue("Arclayer Cloud");
    await user.clear(editableName);
    await user.type(editableName, "Arclayer Enterprise");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(updatePlatformSystemSettingsSection).toHaveBeenCalledWith(
      "identity",
      expect.objectContaining({ expected_revision: 4, instance_name: "Arclayer Enterprise" }),
    );
    expect(await screen.findByDisplayValue("Arclayer Enterprise")).toBeDisabled();
  });

  it("switches grouped panels and renders accessible country flags for verified languages", async () => {
    const user = userEvent.setup();
    render(<SystemSettingsPage />);

    await user.click(screen.getByRole("button", { name: "Language settings" }));

    expect(await screen.findByRole("heading", { name: "Language settings" })).toBeVisible();
    expect(screen.getByRole("img", { name: "China flag" })).toHaveClass("fi", "fi-cn");
    expect(screen.getByRole("img", { name: "United States flag" })).toHaveClass("fi", "fi-us");
    expect(screen.getByText("zh-CN · 简体中文")).toBeVisible();
    expect(screen.getByText("English (United States)")).toBeVisible();
    expect(screen.getByText("en-US", { exact: false })).toBeVisible();
    expect(screen.getByText("Platform console only")).toBeVisible();
  });

  it("publishes a verified language catalog through draft and impact review", async () => {
    const user = userEvent.setup();
    render(<SystemSettingsPage />);

    await user.click(screen.getByRole("button", { name: "Language settings" }));
    await user.click(screen.getByRole("button", { name: "Edit these settings" }));
    expect(screen.getByRole("dialog", { name: "Edit console languages" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Publish language changes" }));

    expect(createPlatformLanguageDraft).toHaveBeenCalledWith(
      expect.objectContaining({ expected_revision: 4, enabled_locales: ["zh-CN", "en-US"] }),
    );
    expect(previewPlatformLanguageDraft).toHaveBeenCalledWith(5);
    expect(publishPlatformLanguageDraft).toHaveBeenCalledWith(
      expect.objectContaining({ expected_revision: 4, draft_revision: 5 }),
    );
  });

  it("keeps useful placeholders on every configuration panel", async () => {
    const user = userEvent.setup();
    render(<SystemSettingsPage />);

    await user.click(screen.getByRole("button", { name: "Domain settings" }));
    expect(screen.getByPlaceholderText("example.com")).toBeDisabled();
    expect(screen.getByPlaceholderText("platform.example.com")).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Region & formats" }));
    expect(screen.getByPlaceholderText("Asia/Shanghai")).toBeDisabled();
    expect(screen.getByPlaceholderText("YYYY-MM-DD")).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Site details" }));
    expect(screen.getByPlaceholderText("Site name")).toBeDisabled();
    expect(screen.getByPlaceholderText("Page title · Site name")).toBeDisabled();
  });

  it("opens a matching global settings editor when a configuration card is clicked", async () => {
    const user = userEvent.setup();
    render(<SystemSettingsPage />);

    await user.click(screen.getByRole("button", { name: "All settings" }));
    await user.click(screen.getByText("Security"));

    expect(await screen.findByRole("dialog", { name: "Edit general settings" })).toBeVisible();
    expect(
      within(screen.getByRole("dialog", { name: "Edit general settings" })).getByPlaceholderText(
        "Enter settings as JSON",
      ),
    ).toHaveValue('{\n  "session_timeout": 3600\n}');
  });
});
