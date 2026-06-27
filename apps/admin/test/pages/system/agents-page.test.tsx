import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SystemSettingsAgentsPage } from "@/pages/system/agents/page";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

const {
  getAIMonthlyUsageSummaryMock,
  getSystemCoreSettingsMock,
  listAIModelsMock,
  notifySuccessTextMock,
  patchSystemCoreSettingsMock,
} = vi.hoisted(() => ({
  getAIMonthlyUsageSummaryMock: vi.fn(),
  getSystemCoreSettingsMock: vi.fn(),
  listAIModelsMock: vi.fn(),
  patchSystemCoreSettingsMock: vi.fn(),
  notifySuccessTextMock: vi.fn(),
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
  getAIMonthlyUsageSummary: (...args: unknown[]) => getAIMonthlyUsageSummaryMock(...args),
  listAIModels: (...args: unknown[]) => listAIModelsMock(...args),
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

vi.mock("@arclayer/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock("@arclayer/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
  }: {
    value: string;
    onValueChange?: (value: string) => void;
    children?: React.ReactNode;
  }) => (
    <select value={value} onChange={(event) => onValueChange?.(event.target.value)}>
      <option value="agent">agent</option>
      <option value="always_approve">always_approve</option>
      <option value="approve_bulk_only">approve_bulk_only</option>
      <option value="approve_schema_only">approve_schema_only</option>
      <option value="auto_approved">auto_approved</option>
      <option value="build">build</option>
      <option value="database">database</option>
      <option value="high">high</option>
      <option value="low">low</option>
      <option value="medium">medium</option>
      <option value="memory">memory</option>
      <option value="plan">plan</option>
    </select>
  ),
  SelectContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
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
    expect(screen.getByText("settings:SETTINGS_SYSTEM_AGENTS_USAGE_BUDGET")).toBeInTheDocument();
    expect(
      screen.getByText("settings:SETTINGS_SYSTEM_AGENTS_USAGE_BUDGET_USED"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("settings:SETTINGS_SYSTEM_AGENTS_USAGE_BUDGET_REMAINING"),
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
      await screen.findByText("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_WRITES_POLICY_UNSUPPORTED"),
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
      await screen.findByText("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_WRITES_DRY_RUN_REQUIRED"),
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
      await screen.findByText("settings:SETTINGS_SYSTEM_AGENTS_SUMMARY_WRITES_SCHEMA_ONLY"),
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
    fireEvent.click(screen.getByRole("button", { name: "settings:SETTINGS_SAVE" }));

    await waitFor(() => {
      expect(patchSystemCoreSettingsMock).toHaveBeenCalledWith({
        ai_agents: {
          enabled: true,
          default_model: "gpt-5-codex",
          reasoning_effort: "medium",
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
      await screen.findByText("settings:SETTINGS_SYSTEM_AGENTS_USAGE_BUDGET_OVER"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("settings:SETTINGS_SYSTEM_AGENTS_USAGE_BUDGET_REMAINING"),
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

    const defaultModelInput = await screen.findByLabelText(
      "settings:SETTINGS_SYSTEM_AGENTS_DEFAULT_MODEL_LABEL",
    );
    fireEvent.change(defaultModelInput, { target: { value: "gpt-5-codex" } });
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

    fireEvent.change(
      await screen.findByLabelText("settings:SETTINGS_SYSTEM_AGENTS_SKILL_IDS_LABEL"),
      {
        target: {
          value: [
            "content.analysis",
            "content.planning",
            "content.build",
            "content.modeling",
            "content.writer",
            "content.modeler",
          ].join("\n"),
        },
      },
    );
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
