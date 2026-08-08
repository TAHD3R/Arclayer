import { beforeEach, describe, expect, it, vi } from "vitest";

const { get, put, post } = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  post: vi.fn(),
}));

vi.mock("@/api/client", () => ({
  platformApiClient: { get, put, post },
}));

import {
  createPlatformLanguageDraft,
  getPlatformSystemSettings,
  previewPlatformLanguageDraft,
  updatePlatformSystemSettingsSection,
  updatePlatformSystemSettingsGenericSection,
} from "@/settings/system-settings-api";

const response = <T>(data: T) => ({
  data: { data },
  response: new Response(null, { status: 200 }),
});

const wireSettings = {
  revision: 8,
  identity: {
    instanceName: "Arclayer Cloud",
    description: null,
    contactEmail: "support@example.com",
    logoUrl: null,
    faviconUrl: null,
  },
  domains: {
    primaryDomain: "example.com",
    consoleDomain: "platform.example.com",
    reservedLabels: ["www", "platform"],
  },
  languages: [
    {
      locale: "zh-CN",
      languageName: "Simplified Chinese",
      nativeName: "简体中文",
      flagCode: "cn",
      enabled: true,
      isDefault: true,
      sortOrder: 0,
      bundleReady: true,
    },
  ],
  regional: { timezone: "Asia/Shanghai", dateFormat: "YYYY-MM-DD", numberFormat: "1,234.56" },
  siteMetadata: {
    defaultTitle: "Arclayer Cloud",
    titleFormat: "Page title · Site name",
    defaultDescription: null,
  },
  sections: [
    {
      id: "security",
      title: "Security",
      fields: [
        {
          key: "session_timeout",
          type: "number",
          label: "Session timeout",
          description: null,
          secret: false,
          options: [],
        },
      ],
      values: { session_timeout: 3600 },
      secretKeys: ["signing_key"],
      editable: true,
    },
  ],
} as const;

describe("Platform system settings API adapter", () => {
  beforeEach(() => vi.clearAllMocks());

  it("normalizes the camelCase settings response for page consumers", async () => {
    get.mockResolvedValue(response(wireSettings));

    await expect(getPlatformSystemSettings()).resolves.toEqual({
      revision: 8,
      identity: {
        instance_name: "Arclayer Cloud",
        description: null,
        contact_email: "support@example.com",
        logo_url: null,
        favicon_url: null,
      },
      domains: {
        primary_domain: "example.com",
        console_domain: "platform.example.com",
        reserved_labels: ["www", "platform"],
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
      ],
      regional: {
        timezone: "Asia/Shanghai",
        date_format: "YYYY-MM-DD",
        number_format: "1,234.56",
      },
      site_metadata: {
        default_title: "Arclayer Cloud",
        title_format: "Page title · Site name",
        default_description: null,
      },
      sections: [
        {
          id: "security",
          title: "Security",
          fields: wireSettings.sections[0].fields,
          values: { session_timeout: 3600 },
          secret_keys: ["signing_key"],
          editable: true,
        },
      ],
    });
    expect(get).toHaveBeenCalledWith({
      security: [{ scheme: "bearer", type: "http" }],
      url: "/platform-api/v1/settings",
    });
  });

  it("normalizes language draft and impact responses", async () => {
    post
      .mockResolvedValueOnce(
        response({
          draftRevision: 9,
          status: "draft",
          enabledLocales: ["zh-CN", "en-US"],
          defaultLocale: "zh-CN",
          bundleReady: true,
        }),
      )
      .mockResolvedValueOnce(
        response({
          draftRevision: 9,
          affectedSurfaces: ["platform-console"],
          requiresProductTodo: true,
          readyToPublish: true,
        }),
      );

    await expect(
      createPlatformLanguageDraft({
        expected_revision: 8,
        idempotency_key: "draft-1",
        enabled_locales: ["zh-CN", "en-US"],
        default_locale: "zh-CN",
      }),
    ).resolves.toEqual({
      draft_revision: 9,
      status: "draft",
      enabled_locales: ["zh-CN", "en-US"],
      default_locale: "zh-CN",
      bundle_ready: true,
    });
    await expect(previewPlatformLanguageDraft(9)).resolves.toEqual({
      draft_revision: 9,
      affected_surfaces: ["platform-console"],
      requires_product_todo: true,
      ready_to_publish: true,
    });
    expect(post).toHaveBeenNthCalledWith(1, {
      security: [{ scheme: "bearer", type: "http" }],
      url: "/platform-api/v1/settings/languages/drafts",
      body: {
        expectedRevision: 8,
        idempotencyKey: "draft-1",
        enabledLocales: ["zh-CN", "en-US"],
        defaultLocale: "zh-CN",
      },
      headers: { "Content-Type": "application/json" },
    });
    expect(post).toHaveBeenNthCalledWith(2, {
      security: [{ scheme: "bearer", type: "http" }],
      url: "/platform-api/v1/settings/languages/drafts/9/impact",
    });
  });

  it("keeps generic section values intact while normalizing its settings envelope", async () => {
    put.mockResolvedValue(response(wireSettings));

    await expect(
      updatePlatformSystemSettingsGenericSection("security controls", {
        expected_revision: 8,
        idempotency_key: "settings-1",
        values: { session_timeout: 7200 },
      }),
    ).resolves.toMatchObject({
      revision: 8,
      sections: [
        expect.objectContaining({
          secret_keys: ["signing_key"],
          values: { session_timeout: 3600 },
        }),
      ],
    });
    expect(put).toHaveBeenCalledWith({
      security: [{ scheme: "bearer", type: "http" }],
      url: "/platform-api/v1/settings/sections/security%20controls",
      body: {
        expectedRevision: 8,
        idempotencyKey: "settings-1",
        values: { session_timeout: 7200 },
      },
      headers: { "Content-Type": "application/json" },
    });
  });

  it("serializes specialized section writes with the public camelCase contract", async () => {
    put.mockResolvedValue(response(wireSettings));

    await updatePlatformSystemSettingsSection("identity", {
      expected_revision: 8,
      idempotency_key: "identity-1",
      instance_name: "Arclayer Enterprise",
      description: null,
      contact_email: "ops@example.com",
      logo_url: null,
      favicon_url: null,
    });

    expect(put).toHaveBeenCalledWith({
      security: [{ scheme: "bearer", type: "http" }],
      url: "/platform-api/v1/settings/identity",
      body: {
        expectedRevision: 8,
        idempotencyKey: "identity-1",
        instanceName: "Arclayer Enterprise",
        description: null,
        contactEmail: "ops@example.com",
        logoUrl: null,
        faviconUrl: null,
      },
      headers: { "Content-Type": "application/json" },
    });
  });
});
