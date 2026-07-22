export function aiAgentUnavailableReasonKey(reason: string | null | undefined): string {
  if (reason === "agents_disabled") return "ai:AI_CONTEXT_RECOMMENDATION_AGENTS_DISABLED";
  if (reason === "write_tools_disabled") {
    return "ai:AI_CONTEXT_RECOMMENDATION_WRITE_TOOLS_DISABLED";
  }
  if (reason === "approval_policy_unsupported") {
    return "ai:AI_CONTEXT_RECOMMENDATION_APPROVAL_POLICY_UNSUPPORTED";
  }
  if (reason === "dry_run_required_disabled") {
    return "ai:AI_CONTEXT_RECOMMENDATION_DRY_RUN_REQUIRED";
  }
  return "ai:AI_CONTEXT_RECOMMENDATION_UNAVAILABLE";
}
