import type {
  BuilderDesignCandidateV1,
  BuilderDesignTokenOut,
  BuilderPageRenderDocumentOut,
  BuilderRenderComponentRecipeOut,
  BuilderRenderRecipeResponsiveOut,
  BuilderRenderRecipeStateOut,
  VisualBlueprintSectionV1,
  VisualBlueprintStateV1,
} from "@arclayer/openapi";

export class DesignPreviewProjectionError extends Error {
  readonly code = "DESIGN_PREVIEW_PROJECTION_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "DesignPreviewProjectionError";
  }
}

export function projectDesignPreviewDocument(
  document: BuilderPageRenderDocumentOut,
  candidate: BuilderDesignCandidateV1,
  tokens: readonly BuilderDesignTokenOut[],
): BuilderPageRenderDocumentOut {
  const tokenValues = new Map(tokens.map((token) => [token.path, token.resolvedValue]));
  const blueprintSections = new Map(
    (candidate.visualBlueprint.sections ?? []).map((section) => [section.sectionId, section]),
  );
  const sections = document.sections.map((section) => {
    const blueprint = blueprintSections.get(section.sourceSectionId) ?? null;
    if (!blueprint) return section;
    if (
      blueprint.componentKey !== section.componentKey ||
      blueprint.variantKey !== section.variantKey
    ) {
      throw new DesignPreviewProjectionError(
        `Candidate section ${blueprint.sectionId} does not match the pinned render contract`,
      );
    }
    return {
      ...section,
      componentRecipe: projectRecipe(section.componentRecipe ?? null, blueprint, tokenValues),
    };
  });
  return { ...document, renderSource: "visual_blueprint", sections };
}

function projectRecipe(
  base: BuilderRenderComponentRecipeOut | null,
  blueprint: VisualBlueprintSectionV1,
  tokenValues: ReadonlyMap<string, BuilderDesignTokenOut["resolvedValue"]>,
): BuilderRenderComponentRecipeOut {
  const states = new Map(
    (base?.states ?? []).map((state) => [state.stateKey, { ...state.styleValues }]),
  );
  const responsive = new Map(
    (base?.responsiveOverrides ?? []).map((override) => [
      override.breakpoint,
      new Map(override.states.map((state) => [state.stateKey, { ...state.styleValues }])),
    ]),
  );
  mergeStates(states, blueprint.states ?? [], tokenValues);
  for (const override of blueprint.responsiveOverrides ?? []) {
    const target = responsive.get(override.breakpoint) ?? new Map();
    mergeStates(target, override.states ?? [], tokenValues);
    responsive.set(override.breakpoint, target);
  }
  return {
    key: base?.key ?? `visual.${blueprint.sectionId}`,
    states: serializeStates(states),
    responsiveOverrides: [...responsive.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([breakpoint, values]): BuilderRenderRecipeResponsiveOut => ({
          breakpoint,
          states: serializeStates(values),
        }),
      ),
  };
}

function mergeStates(
  target: Map<string, BuilderRenderRecipeStateOut["styleValues"]>,
  source: readonly VisualBlueprintStateV1[],
  tokenValues: ReadonlyMap<string, BuilderDesignTokenOut["resolvedValue"]>,
): void {
  for (const state of source) {
    const values = { ...target.get(state.stateKey) };
    for (const [slotKey, tokenPath] of Object.entries(state.styleTokens ?? {}).sort()) {
      const resolved = tokenValues.get(tokenPath);
      if (resolved === undefined) {
        throw new DesignPreviewProjectionError(`Candidate token ${tokenPath} is unavailable`);
      }
      values[slotKey] = resolved;
    }
    target.set(state.stateKey, values);
  }
}

function serializeStates(
  states: ReadonlyMap<string, BuilderRenderRecipeStateOut["styleValues"]>,
): BuilderRenderRecipeStateOut[] {
  return [...states.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([stateKey, styleValues]) => ({ stateKey, styleValues }));
}
