import type { BuilderGenerationStatus } from "@arclayer/openapi";

export type WireframeGenerateArgs = {
  readonly pageItemId: string;
  readonly objective: string;
  readonly locale: string;
  readonly candidateCount: number;
};

export type WireframeGenerationReference = {
  readonly generationId: string;
  readonly jobId: string;
  readonly projectId: string;
  readonly baseRevisionId: string;
  readonly targetStage: "wireframe";
  readonly selectedPageId: string;
  readonly status: BuilderGenerationStatus;
};

export const WIREFRAME_TERMINAL_STATUSES = new Set<BuilderGenerationStatus>([
  "partial",
  "succeeded",
  "failed",
  "cancelled",
]);

const GENERATION_STATUSES = new Set<BuilderGenerationStatus>([
  "queued",
  "running",
  ...WIREFRAME_TERMINAL_STATUSES,
]);

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : null;
}

export function readWireframeGenerateArgs(
  args: Record<string, unknown>,
): WireframeGenerateArgs | null {
  const pageItemId = readString(args, "pageItemId");
  const objective = readString(args, "objective");
  const locale = readString(args, "locale");
  const candidateCount = args.candidateCount;
  if (
    pageItemId === null ||
    objective === null ||
    locale === null ||
    !Number.isInteger(candidateCount) ||
    Number(candidateCount) < 1 ||
    Number(candidateCount) > 3
  ) {
    return null;
  }
  return { pageItemId, objective, locale, candidateCount: Number(candidateCount) };
}

export function readWireframeGenerationReference(
  result: unknown,
): WireframeGenerationReference | null {
  if (typeof result !== "object" || result === null || Array.isArray(result)) return null;
  const record = result as Record<string, unknown>;
  const generationId = readString(record, "generationId");
  const jobId = readString(record, "jobId");
  const projectId = readString(record, "projectId");
  const baseRevisionId = readString(record, "baseRevisionId");
  const targetStage = record.targetStage;
  const selectedPageId = readString(record, "selectedPageId");
  const status = record.status;
  if (
    generationId === null ||
    jobId === null ||
    projectId === null ||
    baseRevisionId === null ||
    targetStage !== "wireframe" ||
    selectedPageId === null ||
    typeof status !== "string" ||
    !GENERATION_STATUSES.has(status as BuilderGenerationStatus)
  ) {
    return null;
  }
  return {
    generationId,
    jobId,
    projectId,
    baseRevisionId,
    targetStage,
    selectedPageId,
    status: status as BuilderGenerationStatus,
  };
}
