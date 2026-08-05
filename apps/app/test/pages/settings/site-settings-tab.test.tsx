import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildGeneralSettingsInitialValues } from "@/lib/settings/general/adapters";
import { SiteSettingsTab } from "@/pages/projects/settings/site/components/tabs/site-settings-tab";
import type { GeneralSettingsFormValues } from "@/types/settings-general";
import { Form } from "@arclayer/ui/form";

const patchMock = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/pages/projects/settings/site/components/tabs/site-brand-asset-accordion-item", () => ({
  SiteBrandAssetSettingRow: (props: { disabled: boolean; title: string }) => (
    <button type="button" disabled={props.disabled}>
      {props.title}
    </button>
  ),
}));

const initialValues = buildGeneralSettingsInitialValues({
  project: {
    namespace: "core",
    value: {
      site: {
        name: "Studio North",
        subtitle: "Stories with a point of view",
        description: "Independent editorial work from Shanghai.",
        url: "https://studio.example.com",
        contact_email: "hello@studio.example.com",
      },
      site_localization: {
        default_locale: "en-US",
        fallback_locale: "en-US",
        supported_locales: ["en-US"],
      },
      seo: {
        title_policy_v1: {
          parts: [
            { kind: "token", value: "pageTitle" },
            { kind: "literal", value: " - " },
            { kind: "token", value: "siteName" },
          ],
          homeMode: "siteOnly",
          dedupe: true,
        },
        robots_directive: "index,follow",
        sitemap_enabled: true,
      },
    },
  },
});

function SiteSettingsHarness(props: { disabled?: boolean; section: "identity" | "discovery" }) {
  const form = useForm<GeneralSettingsFormValues>({ defaultValues: initialValues });

  return (
    <Form {...form}>
      <SiteSettingsTab
        assetProjectId="project-1"
        disabled={props.disabled ?? false}
        form={form}
        initialValues={initialValues}
        patch={patchMock}
        resolvedPublicUrl="https://www.primary.example.com"
        savingKey={null}
        section={props.section}
        withSavingKey={async (_key, task) => task()}
      />
    </Form>
  );
}

describe("SiteSettingsTab", () => {
  beforeEach(() => {
    patchMock.mockReset();
    patchMock.mockResolvedValue(undefined);
  });

  it("updates the public identity preview before saving and persists the real site patch", async () => {
    const user = userEvent.setup();
    render(<SiteSettingsHarness section="identity" />);

    const preview = screen.getByTestId("website-identity-preview");
    expect(within(preview).getAllByText("Studio North").length).toBeGreaterThan(0);
    expect(preview).toHaveTextContent("Independent editorial work from Shanghai.");
    expect(preview).toHaveTextContent("hello@studio.example.com");
    expect(preview).toHaveTextContent("www.primary.example.com");
    expect(screen.getByTestId("website-resolved-public-url")).toHaveTextContent(
      "https://www.primary.example.com",
    );
    expect(
      screen.queryByPlaceholderText("settings:SETTINGS_SITE_PUBLIC_URL_PLACEHOLDER"),
    ).not.toBeInTheDocument();

    const nameInput = screen.getByPlaceholderText("settings:SETTINGS_SITE_NAME_PLACEHOLDER");
    await user.clear(nameInput);
    await user.type(nameInput, "Field Notes");

    expect(within(preview).getAllByText("Field Notes").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "settings:SETTINGS_SAVE" }));

    await waitFor(() => {
      expect(patchMock).toHaveBeenCalledWith({
        site: {
          name: "Field Notes",
          name_i18n: null,
          subtitle: "Stories with a point of view",
          description: "Independent editorial work from Shanghai.",
          description_i18n: null,
          contact_email: "hello@studio.example.com",
        },
      });
    });
  });

  it("updates discovery status from the unsaved indexing policy and persists SEO defaults", async () => {
    const user = userEvent.setup();
    render(<SiteSettingsHarness section="discovery" />);

    const preview = screen.getByTestId("website-discovery-preview");
    expect(preview).toHaveTextContent("Independent editorial work from Shanghai.");
    expect(preview).toHaveTextContent("www.primary.example.com");
    expect(preview).toHaveTextContent(
      "settings:SETTINGS_SEO_TITLE_FORMAT_SAMPLE_PAGE_TITLE - Studio North",
    );

    await user.click(
      screen.getByRole("switch", { name: "settings:SETTINGS_SITE_SEARCH_INDEXING_LABEL" }),
    );

    expect(preview).toHaveTextContent("settings:SETTINGS_SITE_DISCOVERY_NOINDEX");
    await user.click(screen.getByRole("button", { name: "settings:SETTINGS_SAVE" }));

    await waitFor(() => {
      expect(patchMock).toHaveBeenCalledWith({
        seo: {
          title_policy_v1: {
            parts: [
              { kind: "token", value: "pageTitle" },
              { kind: "literal", value: " - " },
              { kind: "token", value: "siteName" },
            ],
            home_mode: "siteOnly",
            dedupe: true,
          },
          robots_directive: "noindex,nofollow",
          sitemap_enabled: true,
        },
      });
    });
  });

  it("disables every title-policy control in read-only mode", () => {
    render(<SiteSettingsHarness section="discovery" disabled />);

    expect(
      screen.getByPlaceholderText("settings:SETTINGS_SEO_TITLE_FORMAT_LITERAL_PLACEHOLDER"),
    ).toBeDisabled();
    expect(
      screen.getByRole("switch", { name: "settings:SETTINGS_SEO_TITLE_FORMAT_DEDUPE_TITLE" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("switch", { name: "settings:SETTINGS_SITE_SEARCH_INDEXING_LABEL" }),
    ).toBeDisabled();
  });
});
