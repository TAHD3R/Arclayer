import type {
  BuilderComponentCatalogOut,
  BuilderGenerationTargetV1,
  BuilderRevisionGlobalSectionOut,
  BuilderRevisionOut,
  BuilderRevisionPageOut,
} from "@arclayer/openapi";

export type WireframeGenerationTargetState =
  | "ready"
  | "missing"
  | "version_missing"
  | "plan_missing"
  | "plan_orphaned"
  | "catalog_mismatch"
  | "graph_blocked";

export interface WireframeGenerationTargetOption {
  readonly target: BuilderGenerationTargetV1;
  readonly title: string;
  readonly locale: string | null;
  readonly location: string | null;
  readonly versionNumber: number | null;
  readonly traceabilityStatus: string | null;
  readonly incomingReferenceCount: number;
  readonly state: WireframeGenerationTargetState;
  readonly reasonKey: string | null;
  readonly executable: boolean;
}

type GenerationHost = BuilderRevisionPageOut | BuilderRevisionGlobalSectionOut;

export function wireframeGenerationTargetKey(target: BuilderGenerationTargetV1): string {
  return `${target.kind}:${target.itemId}`;
}

export function buildWireframeGenerationTargetCatalog(
  revision: BuilderRevisionOut | null,
  componentCatalog: BuilderComponentCatalogOut | null,
): readonly WireframeGenerationTargetOption[] {
  if (!revision) return [];
  const graphBlockedIds = collectGraphBlockedIds(revision);
  const incomingReferences = countIncomingReferences(revision);
  return [
    ...revision.pages.map((page) =>
      buildTargetOption({
        kind: "page",
        host: page,
        revision,
        componentCatalog,
        graphBlockedIds,
        incomingReferences,
      }),
    ),
    ...(revision.globalSections ?? []).map((globalSection) =>
      buildTargetOption({
        kind: "global_section",
        host: globalSection,
        revision,
        componentCatalog,
        graphBlockedIds,
        incomingReferences,
      }),
    ),
  ];
}

export function resolveWireframeGenerationTargets(
  targets: readonly BuilderGenerationTargetV1[],
  catalog: readonly WireframeGenerationTargetOption[],
): readonly WireframeGenerationTargetOption[] {
  const byKey = new Map(
    catalog.map((option) => [wireframeGenerationTargetKey(option.target), option]),
  );
  return targets.map(
    (target) =>
      byKey.get(wireframeGenerationTargetKey(target)) ?? {
        target,
        title: target.itemId,
        locale: null,
        location: null,
        versionNumber: null,
        traceabilityStatus: null,
        incomingReferenceCount: 0,
        state: "missing",
        reasonKey: "CREATION_EDITOR_WIREFRAME_GENERATION_TARGET_MISSING",
        executable: false,
      },
  );
}

function buildTargetOption({
  kind,
  host,
  revision,
  componentCatalog,
  graphBlockedIds,
  incomingReferences,
}: Readonly<{
  kind: BuilderGenerationTargetV1["kind"];
  host: GenerationHost;
  revision: BuilderRevisionOut;
  componentCatalog: BuilderComponentCatalogOut | null;
  graphBlockedIds: ReadonlySet<string>;
  incomingReferences: ReadonlyMap<string, number>;
}>): WireframeGenerationTargetOption {
  const state = resolveTargetState({ host, revision, componentCatalog, graphBlockedIds });
  const route =
    "routes" in host ? (host.routes?.find((item) => item.isActive) ?? host.routes?.[0]) : null;
  return {
    target: { kind, itemId: host.itemId },
    title: host.title,
    locale: "locale" in host ? host.locale : (route?.locale ?? null),
    location: "slug" in host ? host.slug : (route?.path ?? null),
    versionNumber: host.versionNumber,
    traceabilityStatus: host.wireframeTraceability.status,
    incomingReferenceCount: incomingReferences.get(host.itemId) ?? 0,
    state,
    reasonKey: targetStateReasonKey(state),
    executable: state === "ready",
  };
}

function resolveTargetState({
  host,
  revision,
  componentCatalog,
  graphBlockedIds,
}: Readonly<{
  host: GenerationHost;
  revision: BuilderRevisionOut;
  componentCatalog: BuilderComponentCatalogOut | null;
  graphBlockedIds: ReadonlySet<string>;
}>): WireframeGenerationTargetState {
  if (!host.contentVersionId || host.versionNumber < 1) return "version_missing";
  if (!host.purpose?.trim() || (host.sectionIntents?.length ?? 0) === 0) return "plan_missing";
  if (host.wireframeTraceability.status === "orphaned") return "plan_orphaned";
  if (
    host.wireframe &&
    componentCatalog &&
    (host.wireframe.designSystemVersionId !== revision.siteRevision.designSystemVersionId ||
      host.wireframe.componentCatalogVersion !== componentCatalog.catalog.catalogVersion)
  ) {
    return "catalog_mismatch";
  }
  if (graphBlockedIds.has(host.itemId)) return "graph_blocked";
  return "ready";
}

function targetStateReasonKey(state: WireframeGenerationTargetState): string | null {
  const keys: Record<Exclude<WireframeGenerationTargetState, "ready">, string> = {
    missing: "CREATION_EDITOR_WIREFRAME_GENERATION_TARGET_MISSING",
    version_missing: "CREATION_EDITOR_WIREFRAME_GENERATION_TARGET_VERSION_REQUIRED",
    plan_missing: "CREATION_EDITOR_WIREFRAME_GENERATION_TARGET_PLAN_REQUIRED",
    plan_orphaned: "CREATION_EDITOR_WIREFRAME_GENERATION_TARGET_PLAN_REPAIR_REQUIRED",
    catalog_mismatch: "CREATION_EDITOR_WIREFRAME_GENERATION_TARGET_CATALOG_MISMATCH",
    graph_blocked: "CREATION_EDITOR_WIREFRAME_GENERATION_TARGET_GRAPH_BLOCKED",
  };
  return state === "ready" ? null : keys[state];
}

function collectGraphBlockedIds(revision: BuilderRevisionOut): ReadonlySet<string> {
  const blocked = new Set<string>();
  for (const cycle of revision.globalSectionGraph?.cycles ?? []) {
    for (const itemId of cycle.itemPath) blocked.add(itemId);
  }
  for (const reference of revision.globalSectionGraph?.unknownReferences ?? []) {
    blocked.add(reference.hostItemId);
    blocked.add(reference.targetItemId);
  }
  return blocked;
}

function countIncomingReferences(revision: BuilderRevisionOut): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const reference of revision.globalSectionGraph?.references ?? []) {
    counts.set(reference.targetItemId, (counts.get(reference.targetItemId) ?? 0) + 1);
  }
  return counts;
}
