import { api } from "@/lib/http";
import { workspacePath } from "@/lib/api";
import type {
  ConvergencePreview,
  ConvergencePreviewRequest,
  RenewalTransitionScheduleOut,
  RenewalTransitionScheduleRequest,
} from "@arclayer/openapi";

export type {
  ConvergenceImpactSnapshot,
  ConvergencePreview,
  ConvergencePreviewRequest,
  CustomRoleImpact,
  FeatureAccessScopeRevisionImpact,
  FeatureSeatAssignmentImpact,
  InvitationImpact,
  MemberImpact,
  PlanRevisionRef,
  QueuedEffectImpact,
  RenewalTransitionScheduleOut,
  RenewalTransitionScheduleRequest,
  RoleResponsibilityImpact,
} from "@arclayer/openapi";

export function createPlanAccessConvergencePreview(
  workspaceId: string,
  payload: ConvergencePreviewRequest,
): Promise<ConvergencePreview> {
  return api.post<ConvergencePreview>(
    workspacePath(workspaceId, "/commerce/access-convergence/previews"),
    payload,
  );
}

export function schedulePlanAccessConvergence(
  workspaceId: string,
  previewId: string,
  payload: RenewalTransitionScheduleRequest,
): Promise<RenewalTransitionScheduleOut> {
  return api.post<RenewalTransitionScheduleOut>(
    workspacePath(
      workspaceId,
      `/commerce/access-convergence/previews/${encodeURIComponent(previewId)}/schedule`,
    ),
    payload,
  );
}

export type PlanAccessConvergenceApi = Readonly<{
  createPreview: typeof createPlanAccessConvergencePreview;
  schedule: typeof schedulePlanAccessConvergence;
}>;

export const planAccessConvergenceApi: PlanAccessConvergenceApi = {
  createPreview: createPlanAccessConvergencePreview,
  schedule: schedulePlanAccessConvergence,
};
