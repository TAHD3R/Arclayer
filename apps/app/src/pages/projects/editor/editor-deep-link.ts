import type { EditorStage } from "@/pages/projects/editor/editor-toolbar";
import type { BuilderGenerationTargetV1 } from "@arclayer/openapi";

export type ProjectEditorSearch = {
  readonly stage: EditorStage;
  readonly page?: string;
  readonly target?: readonly string[];
};

const EDITOR_STAGES = new Set<EditorStage>(["sitemap", "wireframe", "styleGuide", "design"]);

export function parseProjectEditorSearch(search: Record<string, unknown>): ProjectEditorSearch {
  const stage =
    typeof search.stage === "string" && EDITOR_STAGES.has(search.stage as EditorStage)
      ? (search.stage as EditorStage)
      : "sitemap";
  const page = typeof search.page === "string" ? search.page.trim() : "";
  const targets = parseTargetSearchValues(search.target);
  return {
    stage,
    ...(page ? { page } : {}),
    ...(targets.length > 0 ? { target: targets } : {}),
  };
}

export function buildProjectEditorHref(
  projectId: string,
  options: Readonly<{
    stage: EditorStage;
    page?: string;
    targets?: readonly BuilderGenerationTargetV1[];
  }>,
): string {
  const search = new URLSearchParams({ stage: options.stage });
  if (options.page) search.set("page", options.page);
  for (const target of options.targets ?? []) {
    search.append("target", serializeProjectEditorTarget(target));
  }
  return `/projects/${encodeURIComponent(projectId)}/editor?${search.toString()}`;
}

export function parseProjectEditorTarget(value: string): BuilderGenerationTargetV1 | null {
  const separator = value.indexOf(":");
  if (separator <= 0) return null;
  const kind = value.slice(0, separator);
  const itemId = value.slice(separator + 1).trim();
  if ((kind !== "page" && kind !== "global_section") || !itemId) return null;
  return { kind, itemId };
}

export function serializeProjectEditorTarget(target: BuilderGenerationTargetV1): string {
  return `${target.kind}:${target.itemId}`;
}

function parseTargetSearchValues(value: unknown): readonly string[] {
  const rawValues = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const targets: string[] = [];
  const seen = new Set<string>();
  for (const rawValue of rawValues.slice(0, 100)) {
    if (typeof rawValue !== "string") continue;
    const target = parseProjectEditorTarget(rawValue);
    if (!target) continue;
    const serialized = serializeProjectEditorTarget(target);
    if (seen.has(serialized)) continue;
    seen.add(serialized);
    targets.push(serialized);
  }
  return targets;
}
