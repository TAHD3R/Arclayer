import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/http/errors";
import { useAccessRestrictionStore } from "@/stores/use-access-restriction-store";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(async () => undefined),
  logout: vi.fn(async () => null),
  cancelQueries: vi.fn(async () => undefined),
  clearQueryClient: vi.fn(),
  notifyError: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  useRouterState: () => "/projects/project-1",
}));
vi.mock("@/api/auth", () => ({ logout: mocks.logout }));
vi.mock("@/lib/query/query-client-instance", () => ({
  queryClient: {
    cancelQueries: mocks.cancelQueries,
    clear: mocks.clearQueryClient,
  },
}));
vi.mock("@/lib/notifications", () => ({ notifyError: mocks.notifyError }));
vi.mock("@/components/feedback/feedback-dialog", () => ({
  HeaderFeedbackPopover: (props: { trigger: React.ReactNode }) => props.trigger,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key.replace(/^platform:/, ""),
    i18n: { language: "en-US", resolvedLanguage: "en-US" },
  }),
}));

import { AccessRestrictionBoundary } from "@/components/builtin/access-restriction-boundary";

function captureRestriction(params: {
  code: "USER_DISABLED" | "WORKSPACE_SUSPENDED" | "PROJECT_SUSPENDED";
  entityType: "user" | "workspace" | "project";
  entityId: string;
  actions: string[];
}) {
  useAccessRestrictionStore.getState().captureApiError(
    new ApiError({
      status: 403,
      error: params.code,
      message: "Restricted",
      meta: {
        restriction: {
          restrictionId: "restriction-1",
          entityType: params.entityType,
          entityId: params.entityId,
          restrictionType: params.code.toLowerCase(),
          state: "active",
          reasonCategory: "security_risk",
          reasonCode: "security_risk",
          effectiveAt: "2026-07-23T00:00:00Z",
          reviewAt: null,
          expiresAt: null,
          revision: 3,
          supportAvailable: true,
          allowedRecoveryActions: params.actions,
        },
      },
    }),
  );
}

describe("AccessRestrictionBoundary", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.navigate.mockClear();
    mocks.logout.mockClear();
    mocks.cancelQueries.mockClear();
    mocks.clearQueryClient.mockClear();
    mocks.notifyError.mockClear();
    useAccessRestrictionStore.getState().clear();
    useAuthStore.setState({ accessToken: "access", refreshToken: "refresh" });
    useWorkspaceStore.setState({
      currentWorkspaceId: "workspace-1",
      lastWorkspaceId: "workspace-1",
      currentProjectId: "project-1",
      lastProjectId: "project-1",
    });
  });

  it("renders protected content when there is no active restriction", () => {
    render(
      <AccessRestrictionBoundary pathname="/projects/project-1">
        <div>Protected content</div>
      </AccessRestrictionBoundary>,
    );

    expect(screen.getByText("Protected content")).toBeInTheDocument();
    expect(screen.queryByTestId("access-restriction-blocker")).not.toBeInTheDocument();
  });

  it("replaces a matching workspace scope with a useful blocker", () => {
    captureRestriction({
      code: "WORKSPACE_SUSPENDED",
      entityType: "workspace",
      entityId: "workspace-1",
      actions: ["switch_workspace", "contact_support"],
    });

    render(
      <AccessRestrictionBoundary pathname="/projects/project-1">
        <div>Protected content</div>
      </AccessRestrictionBoundary>,
    );

    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
    expect(screen.getByText("ACCESS_RESTRICTION_WORKSPACE_SUSPENDED_TITLE")).toBeInTheDocument();
    expect(screen.getByText("ACCESS_RESTRICTION_REASON_SECURITY_RISK")).toBeInTheDocument();
    expect(screen.getByText("ACCESS_RESTRICTION_SWITCH_WORKSPACE")).toBeInTheDocument();
    expect(screen.getByText("ACCESS_RESTRICTION_CONTACT_SUPPORT")).toBeInTheDocument();
    expect(screen.getByText("ACCESS_RESTRICTION_SIGN_OUT")).toBeInTheDocument();
  });

  it("does not block a different workspace with stale restriction state", () => {
    captureRestriction({
      code: "WORKSPACE_SUSPENDED",
      entityType: "workspace",
      entityId: "workspace-2",
      actions: ["switch_workspace"],
    });

    render(
      <AccessRestrictionBoundary pathname="/projects/project-1">
        <div>Protected content</div>
      </AccessRestrictionBoundary>,
    );

    expect(screen.getByText("Protected content")).toBeInTheDocument();
  });

  it("blocks the full authenticated app for a disabled user without scope switching", () => {
    captureRestriction({
      code: "USER_DISABLED",
      entityType: "user",
      entityId: "user-1",
      actions: ["contact_support", "sign_out"],
    });

    render(
      <AccessRestrictionBoundary pathname="/system/overview">
        <div>Protected content</div>
      </AccessRestrictionBoundary>,
    );

    expect(screen.getByText("ACCESS_RESTRICTION_USER_DISABLED_TITLE")).toBeInTheDocument();
    expect(screen.queryByText("ACCESS_RESTRICTION_SWITCH_WORKSPACE")).not.toBeInTheDocument();
    expect(screen.queryByText("ACCESS_RESTRICTION_SWITCH_PROJECT")).not.toBeInTheDocument();
  });

  it("leaves a suspended project and clears the captured restriction", async () => {
    captureRestriction({
      code: "PROJECT_SUSPENDED",
      entityType: "project",
      entityId: "project-1",
      actions: ["switch_project", "contact_support"],
    });

    render(
      <AccessRestrictionBoundary pathname="/projects/project-1">
        <div>Protected content</div>
      </AccessRestrictionBoundary>,
    );
    fireEvent.click(screen.getByText("ACCESS_RESTRICTION_SWITCH_PROJECT"));

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith({ to: "/projects", replace: true });
      expect(useAccessRestrictionStore.getState().active).toBeNull();
    });
    expect(useWorkspaceStore.getState().currentProjectId).toBeNull();
    expect(useWorkspaceStore.getState().lastProjectId).toBeNull();
  });

  it("signs out through the server before clearing local session state", async () => {
    captureRestriction({
      code: "USER_DISABLED",
      entityType: "user",
      entityId: "user-1",
      actions: ["contact_support", "sign_out"],
    });

    render(
      <AccessRestrictionBoundary pathname="/system/overview">
        <div>Protected content</div>
      </AccessRestrictionBoundary>,
    );
    fireEvent.click(screen.getByText("ACCESS_RESTRICTION_SIGN_OUT"));

    await waitFor(() => {
      expect(mocks.logout).toHaveBeenCalledWith({ refreshToken: "refresh" });
      expect(mocks.clearQueryClient).toHaveBeenCalledOnce();
      expect(mocks.navigate).toHaveBeenCalledWith({ to: "/login", replace: true });
    });
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAccessRestrictionStore.getState().active).toBeNull();
  });
});
