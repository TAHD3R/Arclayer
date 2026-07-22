import type { DesignSystemConceptGenerationStatus } from "@arclayer/openapi";

export type StyleGuideGenerateArgs = {
  readonly objective: string;
  readonly locale: string;
  readonly candidateCount: number;
};

export type StyleGuideGenerationReference = {
  readonly generationId: string;
  readonly jobId: string;
  readonly projectId: string;
  readonly designSystemId: string;
  readonly baseVersionId: string;
  readonly baseRevisionId: string;
  readonly status: DesignSystemConceptGenerationStatus;
};

export const STYLE_GUIDE_TERMINAL_STATUSES = new Set<DesignSystemConceptGenerationStatus>([
  "partial",
  "succeeded",
  "failed",
  "cancelled",
]);

const GENERATION_STATUSES = new Set<DesignSystemConceptGenerationStatus>([
  "queued",
  "running",
  ...STYLE_GUIDE_TERMINAL_STATUSES,
]);

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : null;
}

export function readStyleGuideGenerateArgs(
  args: Record<string, unknown>,
): StyleGuideGenerateArgs | null {
  const objective = readString(args, "objective");
  const locale = readString(args, "locale");
  const candidateCount = args.candidateCount;
  if (
    objective === null ||
    locale === null ||
    !Number.isInteger(candidateCount) ||
    Number(candidateCount) < 1 ||
    Number(candidateCount) > 3
  ) {
    return null;
  }
  return { objective, locale, candidateCount: Number(candidateCount) };
}

export function readStyleGuideGenerationReference(
  result: unknown,
): StyleGuideGenerationReference | null {
  if (typeof result !== "object" || result === null || Array.isArray(result)) return null;
  const record = result as Record<string, unknown>;
  const generationId = readString(record, "generationId");
  const jobId = readString(record, "jobId");
  const projectId = readString(record, "projectId");
  const designSystemId = readString(record, "designSystemId");
  const baseVersionId = readString(record, "baseVersionId");
  const baseRevisionId = readString(record, "baseRevisionId");
  const status = record.status;
  if (
    generationId === null ||
    jobId === null ||
    projectId === null ||
    designSystemId === null ||
    baseVersionId === null ||
    baseRevisionId === null ||
    typeof status !== "string" ||
    !GENERATION_STATUSES.has(status as DesignSystemConceptGenerationStatus)
  ) {
    return null;
  }
  return {
    generationId,
    jobId,
    projectId,
    designSystemId,
    baseVersionId,
    baseRevisionId,
    status: status as DesignSystemConceptGenerationStatus,
  };
}
