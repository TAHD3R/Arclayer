import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SystemSettingsAgentsPage } from "@/pages/system/agents/page";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

const {
  getAIMonthlyUsageSummaryMock,
  createAISystemProviderMock,
  deleteAISystemProviderMock,
  getSystemCoreSettingsMock,
  listAISystemProvidersMock,
  listAIModelsMock,
  notifySuccessTextMock,
  patchSystemCoreSettingsMock,
  updateAISystemProviderMock,
} = vi.hoisted(() => ({
  getAIMonthlyUsageSummaryMock: vi.fn(),
  createAISystemProviderMock: vi.fn(),
  deleteAISystemProviderMock: vi.fn(),
  getSystemCoreSettingsMock: vi.fn(),
  listAISystemProvidersMock: vi.fn(),
  listAIModelsMock: vi.fn(),
  patchSystemCoreSettingsMock: vi.fn(),
  notifySuccessTextMock: vi.fn(),
  updateAISystemProviderMock: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/api/settings", () => ({
  getSystemCoreSettings: () => getSystemCoreSettingsMock(),
  patchSystemCoreSettings: (...args: unknown[]) => patchSystemCoreSettingsMock(...args),
}));

vi.mock("@/api/ai", () => ({
  createAISystemProvider: (...args: unknown[]) => createAISystemProviderMock(...args),
  deleteAISystemProvider: (...args: unknown[]) => deleteAISystemProviderMock(...args),
  getAIMonthlyUsageSummary: (...args: unknown[]) => getAIMonthlyUsageSummaryMock(...args),
  listAISystemProviders: (...args: unknown[]) => listAISystemProvidersMock(...args),
  listAIModels: (...args: unknown[]) => listAIModelsMock(...args),
  updateAISystemProvider: (...args: unknown[]) => updateAISystemProviderMock(...args),
}));

vi.mock("@/lib/notifications", () => ({
  notifySuccessText: (...args: unknown[]) => notifySuccessTextMock(...args),
}));

vi.mock("@/layouts/page-shell/content-guard", () => ({
  ContentGuard: ({
    loading,
    error,
    children,
  }: {
    loading?: boolean;
    error?: unknown;
    children?: React.ReactNode;
  }) => {
    if (loading) return <div>loading</div>;
    if (error) return <div>error</div>;
    return <div>{children}</div>;
  },
}));

vi.mock("@/pages/system/components/system-setting-item", () => ({
  SystemSettingStack: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SystemSettingItem: ({
    id,
    title,
    description,
    children,
    footer,
  }: {
    id: string;
    title: React.ReactNode;
    description?: React.ReactNode;
    children?: React.ReactNode;
    footer?: React.ReactNode;
  }) => (
    <section id={id}>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {children}
      {footer}
    </section>
  ),
  SystemSettingField: ({
    label,
    description,
    message,
    children,
  }: {
    label: React.ReactNode;
    description?: React.ReactNode;
    message?: React.ReactNode;
    children?: React.ReactNode;
  }) => (
    <div>
      <label>
        <span>{label}</span>
        {children}
      </label>
      {description ? <span>{description}</span> : null}
      {message}
    </div>
  ),
  SystemSettingInlineNote: ({ children }: { children?: React.ReactNode; className?: string }) => (
    <p>{children}</p>
  ),
  SystemSettingFooterActions: ({
    dirty,
    pending,
    onReset,
    onSave,
  }: {
    dirty: boolean;
    pending?: boolean;
    onReset: () => void;
    onSave: () => void;
  }) =>
    dirty ? (
      <div>
        <button type="button" disabled={pending} onClick={onReset}>
          settings:SETTINGS_RESET
        </button>
        <button type="button" disabled={pending} onClick={onSave}>
          settings:SETTINGS_SAVE
        </button>
      </div>
    ) : null,
  SystemSettingRow: ({
    title,
    description,
    control,
    children,
  }: {
    title: React.ReactNode;
    description?: React.ReactNode;
    control?: React.ReactNode;
    children?: React.ReactNode;
  }) => (
    <div>
      <label>
        <span>{title}</span>
        {control}
      </label>
      {description ? <span>{description}</span> : null}
      {children}
    </div>
  ),
}));

vi.mock("@arclayer/ui/setting-dialog", () => ({
  SettingDialog: ({
    open,
    title,
    description,
    children,
    footer,
  }: {
    open: boolean;
    title?: React.ReactNode;
    description?: React.ReactNode;
    children?: React.ReactNode;
    footer?: React.ReactNode;
  }) =>
    open ? (
      <div role="dialog" aria-label={typeof title === "string" ? title : undefined}>
        {title ? <h3>{title}</h3> : null}
        {description ? <p>{description}</p> : null}
        {children}
        {footer ? <div>{footer}</div> : null}
      </div>
    ) : null,
}));

vi.mock("@arclayer/ui/setting-dialog-field", () => ({
  SettingDialogFields: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SettingDialogField: ({
    title,
    description,
    children,
  }: {
    title?: React.ReactNode;
    description?: React.ReactNode;
    children?: React.ReactNode;
  }) => (
    <label>
      {title ? <span>{title}</span> : null}
      {children}
      {description ? <span>{description}</span> : null}
    </label>
  ),
}));

vi.mock("@arclayer/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock("@arclayer/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange?: (value: string) => void;
    children?: React.ReactNode;
  }) => (
    <select value={value} onChange={(event) => onValueChange?.(event.target.value)}>
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectItem: ({
    value,
    disabled,
    children,
  }: {
    value: string;
    disabled?: boolean;
    children?: React.ReactNode;
  }) => (
    <option value={value} disabled={disabled}>
      {children}
    </option>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
}));

vi.mock("@arclayer/ui/switch", () => ({
  Switch: ({
    checked,
    onCheckedChange,
  }: {
    checked: boolean;
    onCheckedChange?: (checked: boolean) => void;
  }) => <input type="checkbox" checked={checked} onChange={() => onCheckedChange?.(!checked)} />,
}));

vi.mock("@arclayer/ui/textarea", () => ({
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}));

function buildCoreSettings() {
  return {
    value: {
      ai_agents: {
        enabled: true,
        default_mode: "build",
        default_model: "deepseek-v4-pro",
        reasoning_effort: "medium",
        system_prompt: "",
        conversation_retention_days: 90,
        auto_title_enabled: true,
        context_recommendations_enabled: true,
        monthly_budget_micros: 100_000_000,
        skills_enabled: true,
        allowed_skill_ids: [
          "content.analysis",
          "content.planning",
          "content.build",
          "content.modeling",
          "content.writer",
          "content.modeler",
        ],
        write_tools_enabled: false,
        approval_policy: "always_approve",
        dry_run_required: true,
      },
      langgraph: {
        enabled: true,
        checkpointer: "database",
        checkpoint_ttl_days: 90,
        interrupt_resume_enabled: true,
      },
    },
  };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SystemSettingsAgentsPage />
    </QueryClientProvider>,
  );
}

describe("SystemSettingsAgentsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSystemCoreSettingsMock.mockResolvedValue(buildCoreSettings());
    getAIMonthlyUsageSummaryMock.mockResolvedValue({
      totalCostMicros: 1250000,
      totalRequests: 7,
      totalPromptTokens: 3000,
      totalCompletionTokens: 1200,
      periodStart: "2026-06-01",
      periodEnd: "2026-06-30",
      byModel: [],
    });
    listAIModelsMock.mockResolvedValue({
      defaultModel: "deepseek-v4-pro",
      defaultMode: "build",
      reasoningEffort: "medium",
      models: [
        {
          id: "deepseek-v4-pro",
          provider: "deepseek",
          label: "DeepSeek V4 Pro",
          available: true,
        },
        {
          id: "gpt-5-codex",
          provider: "openai",
          label: "GPT-5 Codex",
          available: true,
        },
      ],
    });
    listAISystemProvidersMock.mockResolvedValue({
      providers: [
        {
          id: "provider-deepseek",
          provider: "deepseek",
          label: "DeepSeek",
          compatibility: "deepseek",
          isActive: true,
          hasVirtualKey: true,
          litellmKeyId: "litellm-deepseek",
          baseUrl: "https://api.deepseek.com/v1",
          requestModel: "deepseek-v4-pro",
          createdAt: "2026-06-01T00:00:00Z",
          updatedAt: "2026-06-01T00:00:00Z",
        },
        {
          id: "provider-openai",
          provider: "openai",
          label: "OpenAI",
          compatibility: "openai",
          isActive: true,
          hasVirtualKey: true,
          litellmKeyId: "litellm-openai",
          baseUrl: "https://api.openai.com/v1",
          requestModel: "gpt-5-codex",
          createdAt: "2026-06-01T00:00:00Z",
          updatedAt: "2026-06-01T00:00:00Z",
        },
      ],
    });
    createAISystemProviderMock.mockResolvedValue(undefined);
    updateAISystemProviderMock.mockResolvedValue(undefined);
    deleteAISystemProviderMock.mockResolvedValue(undefined);
    patchSystemCoreSettingsMock.mockResolvedValue(buildCoreSettings());
    useWorkspaceStore.setState({
      currentWorkspaceId: "workspace-1",
      lastWorkspaceId: "workspace-1",
      currentProjectId: null,
      lastProjectId: null,
    });
  });

  it("renders the agent settings summary and sections", async () => {
    renderPage();

    expect(
      await screen.findByText("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_TITLE"),
    ).toBeInTheDocument();
    expect(screen.getByText("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_RUNTIME")).toBeInTheDocument();
    expect(screen.getByText("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_WRITES")).toBeInTheDocument();
    expect(
      screen.getByText("settings:SETTINGS_SYSTEM_AGENTS_GOVERNANCE_TITLE"),
    ).toBeInTheDocument();
    expect(screen.getByText("settings:SETTINGS_SYSTEM_AGENTS_USAGE_TITLE")).toBeInTheDocument();
    expect(
      screen.getByText("settings:SETTINGS_SYSTEM_AGENTS_USAGE_BUDGET_LABEL"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("settings:SETTINGS_SYSTEM_AGENTS_USAGE_BUDGET_USED_LABEL"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("settings:SETTINGS_SYSTEM_AGENTS_USAGE_BUDGET_REMAINING_LABEL"),
    ).toBeInTheDocument();
    expect(screen.getByText("settings:SETTINGS_SYSTEM_AGENTS_PROVIDER_TITLE")).toBeInTheDocument();
    expect(screen.getByText("settings:SETTINGS_SYSTEM_AGENTS_RUNTIME_TITLE")).toBeInTheDocument();
    expect(
      screen.getByText("settings:SETTINGS_SYSTEM_AGENTS_MODES_SKILLS_TITLE"),
    ).toBeInTheDocument();
    expect(screen.getByText("settings:SETTINGS_SYSTEM_AGENTS_APPROVALS_TITLE")).toBeInTheDocument();
    expect(screen.getByText("settings:SETTINGS_SYSTEM_AGENTS_LANGGRAPH_TITLE")).toBeInTheDocument();
    await waitFor(() => {
      expect(getAIMonthlyUsageSummaryMock).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: "workspace-1" }),
      );
      expect(listAIModelsMock).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: "workspace-1" }),
      );
    });
  });

  it("summarizes unsupported write approval policies as disabled runtime posture", async () => {
    getSystemCoreSettingsMock.mockResolvedValue({
      value: {
        ...buildCoreSettings().value,
        ai_agents: {
          ...buildCoreSettings().value.ai_agents,
          write_tools_enabled: true,
          approval_policy: "auto_approved",
          dry_run_required: true,
        },
      },
    });

    renderPage();

    expect(
      await screen.findByText("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_WRITES_UNSUPPORTED_VALUE"),
    ).toBeInTheDocument();
  });

  it("summarizes disabled dry-run checkpoints as unsupported write posture", async () => {
    getSystemCoreSettingsMock.mockResolvedValue({
      value: {
        ...buildCoreSettings().value,
        ai_agents: {
          ...buildCoreSettings().value.ai_agents,
          write_tools_enabled: true,
          approval_policy: "always_approve",
          dry_run_required: false,
        },
      },
    });

    renderPage();

    expect(
      await screen.findByText("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_WRITES_NEEDS_DRY_RUN_VALUE"),
    ).toBeInTheDocument();
  });

  it("summarizes schema-only approval as model proposals only", async () => {
    getSystemCoreSettingsMock.mockResolvedValue({
      value: {
        ...buildCoreSettings().value,
        ai_agents: {
          ...buildCoreSettings().value.ai_agents,
          write_tools_enabled: true,
          approval_policy: "approve_schema_only",
          dry_run_required: true,
        },
      },
    });

    renderPage();

    expect(
      await screen.findByText("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_SCHEMA_PROPOSALS_LABEL"),
    ).toBeInTheDocument();
  });

  it("saves runtime defaults to the ai_agents section", async () => {
    renderPage();

    fireEvent.change(
      await screen.findByLabelText("settings:SETTINGS_SYSTEM_AGENTS_DEFAULT_MODEL_LABEL"),
      { target: { value: "gpt-5-codex" } },
    );
    fireEvent.change(screen.getByLabelText("settings:SETTINGS_SYSTEM_AGENTS_RETENTION_LABEL"), {
      target: { value: "45" },
    });
    fireEvent.change(screen.getByLabelText("settings:SETTINGS_SYSTEM_AGENTS_SYSTEM_PROMPT_LABEL"), {
      target: { value: "  始终使用用户最后一条消息的语言回答。  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "settings:SETTINGS_SAVE" }));

    await waitFor(() => {
      expect(patchSystemCoreSettingsMock).toHaveBeenCalledWith({
        ai_agents: {
          enabled: true,
          default_model: "gpt-5-codex",
          reasoning_effort: "medium",
          system_prompt: "始终使用用户最后一条消息的语言回答。",
          conversation_retention_days: 45,
          auto_title_enabled: true,
          context_recommendations_enabled: true,
        },
      });
    });
  });

  it("saves monthly AI budget governance to the ai_agents section", async () => {
    renderPage();

    fireEvent.change(
      await screen.findByLabelText("settings:SETTINGS_SYSTEM_AGENTS_MONTHLY_BUDGET_LABEL"),
      { target: { value: "25.5" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "settings:SETTINGS_SAVE" }));

    await waitFor(() => {
      expect(patchSystemCoreSettingsMock).toHaveBeenCalledWith({
        ai_agents: {
          monthly_budget_micros: 25_500_000,
        },
      });
    });
  });

  it("shows over-budget governance status when current usage exceeds the monthly budget", async () => {
    getSystemCoreSettingsMock.mockResolvedValue({
      value: {
        ...buildCoreSettings().value,
        ai_agents: {
          ...buildCoreSettings().value.ai_agents,
          monthly_budget_micros: 1_000_000,
        },
      },
    });
    getAIMonthlyUsageSummaryMock.mockResolvedValue({
      totalCostMicros: 2_500_000,
      totalRequests: 7,
      totalPromptTokens: 3000,
      totalCompletionTokens: 1200,
      periodStart: "2026-06-01",
      periodEnd: "2026-06-30",
      byModel: [],
    });

    renderPage();

    expect(
      await screen.findByText("settings:SETTINGS_SYSTEM_AGENTS_USAGE_BUDGET_OVER_LABEL"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("settings:SETTINGS_SYSTEM_AGENTS_USAGE_BUDGET_REMAINING_LABEL"),
    ).not.toBeInTheDocument();
  });

  it("rejects a non-positive monthly AI budget before saving governance settings", async () => {
    renderPage();

    fireEvent.change(
      await screen.findByLabelText("settings:SETTINGS_SYSTEM_AGENTS_MONTHLY_BUDGET_LABEL"),
      { target: { value: "0" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "settings:SETTINGS_SAVE" }));

    expect(await screen.findByText("settings:SETTINGS_VALIDATION_POSITIVE")).toBeInTheDocument();
    expect(patchSystemCoreSettingsMock).not.toHaveBeenCalled();
  });

  it("rejects a non-positive conversation retention value before saving runtime settings", async () => {
    renderPage();

    fireEvent.change(
      await screen.findByLabelText("settings:SETTINGS_SYSTEM_AGENTS_RETENTION_LABEL"),
      { target: { value: "0" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "settings:SETTINGS_SAVE" }));

    expect(await screen.findByText("settings:SETTINGS_VALIDATION_POSITIVE")).toBeInTheDocument();
    expect(patchSystemCoreSettingsMock).not.toHaveBeenCalled();
  });

  it("rejects a blank default model before saving runtime settings", async () => {
    renderPage();

    const defaultModelInput = await screen.findByLabelText(
      "settings:SETTINGS_SYSTEM_AGENTS_DEFAULT_MODEL_LABEL",
    );
    fireEvent.change(defaultModelInput, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "settings:SETTINGS_SAVE" }));

    expect(await screen.findByText("settings:SETTINGS_VALIDATION_REQUIRED")).toBeInTheDocument();
    expect(patchSystemCoreSettingsMock).not.toHaveBeenCalled();
  });

  it("rejects an unavailable default model before saving runtime settings", async () => {
    getSystemCoreSettingsMock.mockResolvedValue({
      value: {
        ...buildCoreSettings().value,
        ai_agents: {
          ...buildCoreSettings().value.ai_agents,
          default_model: "gpt-5-codex",
        },
      },
    });
    listAIModelsMock.mockResolvedValue({
      defaultModel: "deepseek-v4-pro",
      defaultMode: "build",
      reasoningEffort: "medium",
      models: [
        {
          id: "deepseek-v4-pro",
          provider: "deepseek",
          label: "DeepSeek V4 Pro",
          available: true,
        },
        {
          id: "gpt-5-codex",
          provider: "openai",
          label: "GPT-5 Codex",
          available: false,
        },
      ],
    });
    renderPage();

    fireEvent.change(
      await screen.findByLabelText("settings:SETTINGS_SYSTEM_AGENTS_RETENTION_LABEL"),
      { target: { value: "45" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "settings:SETTINGS_SAVE" }));

    expect(
      await screen.findByText("settings:SETTINGS_SYSTEM_AGENTS_DEFAULT_MODEL_UNAVAILABLE"),
    ).toBeInTheDocument();
    expect(patchSystemCoreSettingsMock).not.toHaveBeenCalled();
  });

  it("saves LangGraph persistence settings to the langgraph section", async () => {
    renderPage();

    fireEvent.change(
      await screen.findByLabelText("settings:SETTINGS_SYSTEM_AGENTS_CHECKPOINTER_LABEL"),
      { target: { value: "memory" } },
    );
    fireEvent.change(
      screen.getByLabelText("settings:SETTINGS_SYSTEM_AGENTS_CHECKPOINT_TTL_LABEL"),
      {
        target: { value: "30" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "settings:SETTINGS_SAVE" }));

    await waitFor(() => {
      expect(patchSystemCoreSettingsMock).toHaveBeenCalledWith({
        langgraph: {
          enabled: true,
          checkpointer: "memory",
          checkpoint_ttl_days: 30,
          interrupt_resume_enabled: true,
        },
      });
    });
  });

  it("rejects a non-positive checkpoint TTL before saving LangGraph settings", async () => {
    renderPage();

    fireEvent.change(
      await screen.findByLabelText("settings:SETTINGS_SYSTEM_AGENTS_CHECKPOINT_TTL_LABEL"),
      {
        target: { value: "0" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "settings:SETTINGS_SAVE" }));

    expect(await screen.findByText("settings:SETTINGS_VALIDATION_POSITIVE")).toBeInTheDocument();
    expect(patchSystemCoreSettingsMock).not.toHaveBeenCalled();
  });

  it("saves the complete skill allowlist to the ai_agents section", async () => {
    getSystemCoreSettingsMock.mockResolvedValue({
      value: {
        ...buildCoreSettings().value,
        ai_agents: {
          ...buildCoreSettings().value.ai_agents,
          allowed_skill_ids: ["content.analysis", "content.planning"],
        },
      },
    });
    renderPage();

    await screen.findByText("settings:SETTINGS_SYSTEM_AGENTS_SKILLS_LIBRARY_LABEL");
    const uploadSkill = async (skillId: string) => {
      const uploadButton = screen
        .getByText("settings:SETTINGS_SYSTEM_AGENTS_SKILL_UPLOAD")
        .closest("button");
      expect(uploadButton).not.toBeNull();
      fireEvent.click(uploadButton!);
      const dialog = await screen.findByRole("dialog", {
        name: "settings:SETTINGS_SYSTEM_AGENTS_SKILL_DIALOG_TITLE",
      });
      fireEvent.change(within(dialog).getByRole("combobox"), {
        target: { value: "inline" },
      });
      fireEvent.change(within(dialog).getByPlaceholderText("content.custom"), {
        target: { value: skillId },
      });
      fireEvent.click(
        screen.getByRole("button", {
          name: "settings:SETTINGS_SYSTEM_AGENTS_SKILL_ADD_TO_LIBRARY",
        }),
      );
    };
    await ["content.build", "content.modeling", "content.writer", "content.modeler"].reduce<
      Promise<void>
    >(async (previousUpload, skillId) => {
      await previousUpload;
      await uploadSkill(skillId);
    }, Promise.resolve());
    fireEvent.click(screen.getByRole("button", { name: "settings:SETTINGS_SAVE" }));

    await waitFor(() => {
      expect(patchSystemCoreSettingsMock).toHaveBeenCalledWith({
        ai_agents: {
          default_mode: "build",
          skills_enabled: true,
          allowed_skill_ids: [
            "content.analysis",
            "content.planning",
            "content.build",
            "content.modeling",
            "content.writer",
            "content.modeler",
          ],
        },
      });
    });
  });

  it("resets one section without discarding unsaved edits in another section", async () => {
    renderPage();

    fireEvent.change(
      await screen.findByLabelText("settings:SETTINGS_SYSTEM_AGENTS_DEFAULT_MODEL_LABEL"),
      { target: { value: "gpt-5-codex" } },
    );
    fireEvent.change(screen.getByLabelText("settings:SETTINGS_SYSTEM_AGENTS_DEFAULT_MODE_LABEL"), {
      target: { value: "plan" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "settings:SETTINGS_RESET" })[0]);

    expect(
      screen.getByLabelText("settings:SETTINGS_SYSTEM_AGENTS_DEFAULT_MODEL_LABEL"),
    ).toHaveValue("deepseek-v4-pro");
    expect(screen.getByLabelText("settings:SETTINGS_SYSTEM_AGENTS_DEFAULT_MODE_LABEL")).toHaveValue(
      "plan",
    );
  });
});
