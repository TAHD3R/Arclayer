import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import type { SystemAiProviderOut } from "@arclayer/platform-openapi";

import { AiProviderEditorDialog } from "@/ai/ai-provider-dialogs";
import { updateAiProvider } from "@/ai/ai-services-api";
import { initializePlatformI18n, i18n } from "@/lib/i18n";

vi.mock("@/ai/ai-services-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/ai/ai-services-api")>();
  return { ...actual, updateAiProvider: vi.fn() };
});
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const provider: SystemAiProviderOut = {
  authHeader: "Authorization",
  baseUrl: "https://api.deepseek.com/v1",
  billingConfig: {
    currency: "USD",
    inputCostMicrosPerMillionTokens: 0,
    outputCostMicrosPerMillionTokens: 0,
  },
  cleanupRequired: false,
  compatibility: "deepseek",
  createdAt: "2026-08-03T00:00:00Z",
  defaultModel: "deepseek-v4-pro",
  expiresAt: null,
  hasVirtualKey: true,
  icon: null,
  id: "provider-1",
  isActive: true,
  isArchived: false,
  label: "DeepSeek",
  lastUsedAt: null,
  litellmKeyId: null,
  modelMappings: [{ providerModel: "deepseek-chat", publicModel: "deepseek-v4-pro" }],
  note: null,
  provider: "deepseek",
  readinessCheckedAt: null,
  readinessFailureCode: null,
  readinessStatus: "unknown",
  testConfig: { expectedText: "OK", maxTokens: 8, prompt: "Respond with OK." },
  updatedAt: "2026-08-03T00:00:00Z",
  websiteUrl: null,
};

beforeAll(async () => {
  await initializePlatformI18n("en-US");
});

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage("en-US");
});

describe("AI provider editor", () => {
  it("sends only fields changed by the operator", async () => {
    const user = userEvent.setup();
    const onCompleted = vi.fn();
    vi.mocked(updateAiProvider).mockResolvedValue({ ...provider, label: "DeepSeek Production" });
    render(
      <AiProviderEditorDialog
        onCompleted={onCompleted}
        onOpenChange={vi.fn()}
        open
        provider={provider}
      />,
    );

    const label = screen.getByLabelText("Label");
    await user.clear(label);
    await user.type(label, "DeepSeek Production");
    await user.click(screen.getByRole("button", { name: "Save AI service" }));

    await waitFor(() =>
      expect(updateAiProvider).toHaveBeenCalledWith("provider-1", {
        label: "DeepSeek Production",
      }),
    );
    expect(onCompleted).toHaveBeenCalledWith("PROVIDER_UPDATED");
  });

  it("lets the API reuse the encrypted stored credential for a connection change", async () => {
    const user = userEvent.setup();
    vi.mocked(updateAiProvider).mockResolvedValue({
      ...provider,
      baseUrl: "https://gateway.example.com/v1",
    });
    render(
      <AiProviderEditorDialog
        onCompleted={vi.fn()}
        onOpenChange={vi.fn()}
        open
        provider={provider}
      />,
    );

    const endpoint = document.querySelector<HTMLInputElement>("#provider-base-url");
    expect(endpoint).not.toBeNull();
    await user.clear(endpoint!);
    await user.type(endpoint!, "https://gateway.example.com/v1");
    await user.click(screen.getByRole("button", { name: "Save AI service" }));

    await waitFor(() =>
      expect(updateAiProvider).toHaveBeenCalledWith("provider-1", {
        baseUrl: "https://gateway.example.com/v1",
      }),
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("persists product model display copy and localized variants", async () => {
    const user = userEvent.setup();
    vi.mocked(updateAiProvider).mockResolvedValue(provider);
    render(
      <AiProviderEditorDialog
        onCompleted={vi.fn()}
        onOpenChange={vi.fn()}
        open
        provider={provider}
      />,
    );

    const displayName = screen.getByLabelText("Default display name");
    await user.clear(displayName);
    await user.type(displayName, "DeepSeek V4 Pro");
    await user.type(screen.getByLabelText("Simplified Chinese name"), "DeepSeek V4 专业版");
    await user.type(screen.getByLabelText("English description"), "Configured for coding");
    await user.click(screen.getByRole("button", { name: "Save AI service" }));

    await waitFor(() =>
      expect(updateAiProvider).toHaveBeenCalledWith("provider-1", {
        modelMappings: [
          {
            publicModel: "deepseek-v4-pro",
            providerModel: "deepseek-chat",
            label: "DeepSeek V4 Pro",
            description: null,
            labelI18n: { "zh-CN": "DeepSeek V4 专业版" },
            descriptionI18n: { "en-US": "Configured for coding" },
          },
        ],
      }),
    );
  });
});
