import { beforeEach, describe, expect, it } from "vitest";

import { ApiError } from "@/lib/http/errors";
import {
  parseAccessRestrictionError,
  useAccessRestrictionStore,
} from "@/stores/use-access-restriction-store";

const restriction = {
  restrictionId: "restriction-1",
  entityType: "workspace",
  entityId: "workspace-1",
  restrictionType: "workspace_suspended",
  state: "active",
  reasonCategory: "security_risk",
  reasonCode: "security_risk",
  effectiveAt: "2026-07-23T00:00:00Z",
  reviewAt: null,
  expiresAt: null,
  revision: 3,
  supportAvailable: true,
  allowedRecoveryActions: ["switch_workspace", "contact_support"],
};

beforeEach(() => {
  useAccessRestrictionStore.getState().clear();
});

describe("access restriction state", () => {
  it("captures a complete restriction from the stable 403 contract", () => {
    const error = new ApiError({
      status: 403,
      error: "WORKSPACE_SUSPENDED",
      message: "Workspace access is suspended",
      meta: { restriction },
    });

    expect(useAccessRestrictionStore.getState().captureApiError(error)).toBe(true);
    expect(useAccessRestrictionStore.getState().active).toEqual({
      code: "WORKSPACE_SUSPENDED",
      message: "Workspace access is suspended",
      restriction,
    });
  });

  it("ignores unrelated errors without clearing an active restriction", () => {
    const activeError = new ApiError({
      status: 403,
      error: "WORKSPACE_SUSPENDED",
      message: "Workspace access is suspended",
      meta: { restriction },
    });
    useAccessRestrictionStore.getState().captureApiError(activeError);

    const unrelated = new ApiError({ status: 500, error: "INTERNAL_ERROR", message: "Failed" });
    expect(parseAccessRestrictionError(unrelated)).toBeNull();
    expect(useAccessRestrictionStore.getState().captureApiError(unrelated)).toBe(false);
    expect(useAccessRestrictionStore.getState().active?.code).toBe("WORKSPACE_SUSPENDED");
  });

  it("retains the stable code when malformed metadata cannot identify a scope", () => {
    const error = new ApiError({
      status: 403,
      error: "USER_DISABLED",
      message: "Account access is disabled",
      meta: { restriction: { entityType: "user" } },
    });

    expect(parseAccessRestrictionError(error)).toEqual({
      code: "USER_DISABLED",
      message: "Account access is disabled",
      restriction: null,
    });
  });
});
