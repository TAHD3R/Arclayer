import type { SystemSetupJobStage } from "@/types/api";
import type { SetupSiteDraft } from "@/types/stores";

export const MAX_STEP = 2;
export const FALLBACK_PRIMARY_BEND_COLOR = "#3b82f6";

export const WORKSPACE_FIELDS: Array<keyof SetupSiteDraft> = [
  "templateKey",
  "workspaceName",
  "siteName",
  "siteUrl",
  "siteDescription",
];

export const SETUP_PROGRESS_STAGE_ORDER: SystemSetupJobStage[] = [
  "precheck",
  "admin",
  "provision",
  "workspace",
  "finalize",
];

export const SETUP_JOB_POLL_INTERVAL_MS = 650;
export const SETUP_JOB_MAX_POLLS = 180;
