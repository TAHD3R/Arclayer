import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import type { PlatformAiProviderOut, SystemAiProviderOut } from "@arclayer/platform-openapi";

import {
  applyAiProviderAvailability,
  applyAiServicesWorkspaceRollout,
  deleteAiProvider,
  getAiProviderReadiness,
  listAiProviders,
  PlatformAiServicesApiError,
  previewAiProviderAvailability,
  previewAiServicesWorkspaceRollout,
  updateAiProvider,
} from "@/ai/ai-services-api";
import { initializePlatformI18n, i18n } from "@/lib/i18n";
import { AiProvidersPage } from "@/pages/ai-services";

vi.mock("@/ai/ai-services-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/ai/ai-services-api")>();
  return {
    ...actual,
    applyAiProviderAvailability: vi.fn(),
    applyAiServicesWorkspaceRollout: vi.fn(),
    deleteAiProvider: vi.fn(),
    getAiProviderReadiness: vi.fn(),
    listAiProviders: vi.fn(),
    previewAiProviderAvailability: vi.fn(),
    previewAiServicesWorkspaceRollout: vi.fn(),
    updateAiProvider: vi.fn(),
  };
});
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function provider(overrides: Partial<SystemAiProviderOut> = {}): SystemAiProviderOut {
  return {
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
    readinessCheckedAt: "2026-08-03T00:00:00Z",
    readinessFailureCode: null,
    readinessStatus: "healthy",
    testConfig: { expectedText: "OK", maxTokens: 8, prompt: "Respond with OK." },
    updatedAt: "2026-08-03T00:00:00Z",
    websiteUrl: null,
    ...overrides,
  };
}

function readiness(overrides: Partial<PlatformAiProviderOut> = {}): PlatformAiProviderOut {
  return {
    actions: [
      { action: "test_readiness", available: true, reasonCode: null },
      { action: "enable", available: false, reasonCode: null },
      { action: "disable", available: true, reasonCode: null },
      { action: "rotate_credentials", available: true, reasonCode: null },
      { action: "remove_credentials", available: false, reasonCode: null },
      { action: "archive", available: false, reasonCode: null },
      { action: "restore", available: false, reasonCode: null },
      { action: "delete", available: false, reasonCode: null },
    ],
    archived: false,
    cleanupRequired: false,
    configured: true,
    defaultModel: "deepseek-v4-pro",
    desiredIsActive: true,
    expiresAt: null,
    freshnessAt: "2026-08-03T00:00:00Z",
    health: "healthy",
    healthFailureCode: null,
    id: "provider-1",
    label: "DeepSeek",
    lastUsedAt: null,
    permitted: true,
    provider: "deepseek",
    reachable: true,
    routable: true,
    ...overrides,
  };
}

beforeAll(async () => {
  await initializePlatformI18n("en-US");
});

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage("en-US");
  vi.mocked(listAiProviders).mockResolvedValue({ providers: [provider()] });
  vi.mocked(getAiProviderReadiness).mockResolvedValue({
    items: [readiness()],
    missingPrerequisiteCodes: [],
  });
  vi.mocked(previewAiProviderAvailability).mockResolvedValue({
    desiredIsActive: false,
    id: "provider-1",
    revision: "r".repeat(64),
    routableProviderCountAfter: 0,
    routableProviderCountBefore: 1,
    wouldLeaveNoRoutableProvider: true,
  });
  vi.mocked(applyAiProviderAvailability).mockResolvedValue(provider({ isActive: false }));
  vi.mocked(previewAiServicesWorkspaceRollout).mockResolvedValue({
    capabilityId: "ai-services",
    capabilityRevision: 2,
    eligibilityRevision: 1,
    eligibilitySnapshotHash: "snapshot",
    expiresAt: "2026-08-04T08:00:00Z",
    id: "rollout-preview-1",
    operationalConsequences: [{ code: "AI_SERVICES_ROLLOUT_OPERATIONAL_CONSEQUENCE" }],
    proposedSelectedWorkspaceIds: [],
    proposedStage: "all_eligible",
    sourcePolicy: {
      capabilityId: "ai-services",
      revision: 0,
      selectedWorkspaceIds: [],
      selectionRevision: 0,
      stage: "not_available",
    },
    summary: {
      affectedWorkspaceCount: 1,
      blockedWorkspaceCount: 0,
      eligibleWorkspaceCount: 1,
      ineligibleWorkspaceCount: 0,
      newlyAvailableWorkspaceIds: ["workspace-1"],
      noLongerAvailableWorkspaceIds: [],
      selectedWorkspaceCount: 0,
    },
    workspaces: [
      {
        currentlyAvailable: false,
        ineligibilityReasons: [],
        isEligible: true,
        proposedAvailable: true,
        selected: false,
        workspaceId: "workspace-1",
      },
    ],
  });
  vi.mocked(applyAiServicesWorkspaceRollout).mockResolvedValue({
    appliedAt: "2026-08-04T06:30:00Z",
    capabilityId: "ai-services",
    replayed: false,
    rolloutRevision: 1,
    selectionRevision: 0,
  });
  vi.mocked(updateAiProvider).mockResolvedValue(provider({ isActive: false, isArchived: true }));
  vi.mocked(deleteAiProvider).mockResolvedValue(undefined);
});

afterEach(cleanup);

async function openProviderAction(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole("button", { name: "Actions for DeepSeek" }));
  await user.click(screen.getByRole("menuitem", { name }));
}

describe("AI provider lifecycle", () => {
  it("does not present an expected-response mismatch as a connection failure", async () => {
    vi.mocked(getAiProviderReadiness).mockResolvedValue({
      items: [
        readiness({
          health: "unhealthy",
          healthFailureCode: "AI_PROVIDER_READINESS_RESPONSE_MISMATCH",
          reachable: true,
          routable: false,
        }),
      ],
      missingPrerequisiteCodes: ["AI_PROVIDER_ROUTABLE"],
    });

    render(<AiProvidersPage />);

    expect(await screen.findByText("Test response mismatch")).toBeVisible();
    expect(screen.queryByText("Connection failed")).not.toBeInTheDocument();
  });

  it("disables an active service and archives it from one visible workflow", async () => {
    const user = userEvent.setup();
    render(<AiProvidersPage />);

    await openProviderAction(user, "Archive");
    expect(await screen.findByText("Disable and archive AI service")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() =>
      expect(applyAiProviderAvailability).toHaveBeenCalledWith("provider-1", false, "r".repeat(64)),
    );
    expect(updateAiProvider).toHaveBeenCalledWith("provider-1", { isArchived: true });
  });

  it("completes disable, archive, and permanent delete without dead-end actions", async () => {
    const user = userEvent.setup();
    render(<AiProvidersPage />);

    await openProviderAction(user, "Delete");
    expect(await screen.findByText("Disable before deleting AI service")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByText("Delete AI service")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleteAiProvider).toHaveBeenCalledWith("provider-1"));
    expect(updateAiProvider).toHaveBeenCalledWith("provider-1", { isArchived: true });
    expect(vi.mocked(updateAiProvider).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(deleteAiProvider).mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });

  it("localizes a provider lifecycle domain error", async () => {
    const user = userEvent.setup();
    vi.mocked(updateAiProvider).mockRejectedValue(
      new PlatformAiServicesApiError("AI_PROVIDER_DEFAULT_MODEL_NOT_MAPPED", 400),
    );
    render(<AiProvidersPage />);

    await openProviderAction(user, "Delete");
    await user.click(await screen.findByRole("button", { name: "Confirm" }));
    await screen.findByText("Delete AI service");
    await i18n.changeLanguage("zh-CN");
    await user.click(screen.getByRole("button", { name: "删除" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("操作未完成", {
        description: "默认模型必须映射到已配置的模型。 · AI_PROVIDER_DEFAULT_MODEL_NOT_MAPPED",
      }),
    );
    expect(deleteAiProvider).not.toHaveBeenCalled();
  });

  it("previews and applies the audited AI Services workspace rollout", async () => {
    const user = userEvent.setup();
    render(<AiProvidersPage />);

    await user.click(await screen.findByRole("button", { name: "Review workspace availability" }));
    expect(await screen.findByText("Enable AI Services for eligible workspaces?")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Enable for eligible workspaces" }));

    await waitFor(() =>
      expect(applyAiServicesWorkspaceRollout).toHaveBeenCalledWith(
        "rollout-preview-1",
        "Enable AI Services for eligible workspaces from the AI Services provider console",
        expect.any(String),
      ),
    );
    expect(toast.success).toHaveBeenCalledWith("Workspace AI availability updated");
  });
});
