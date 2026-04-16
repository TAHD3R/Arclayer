import slugify from "slugify";
import { pinyin } from "pinyin-pro";

export const WORKSPACE_SLUG_MAX_LENGTH = 64;

const HANZI_SEGMENT_REGEX = /\p{Script=Han}/u;

export type WorkspaceSlugSource = "profile-seed" | "name-seed" | "manual";

export type WorkspaceSlugState = {
  value: string;
  source: WorkspaceSlugSource;
};

let zhWordSegmenter: Intl.Segmenter | null | undefined;

function getZhWordSegmenter() {
  if (zhWordSegmenter !== undefined) {
    return zhWordSegmenter;
  }

  if (typeof Intl === "undefined" || typeof Intl.Segmenter !== "function") {
    zhWordSegmenter = null;
    return zhWordSegmenter;
  }

  zhWordSegmenter = new Intl.Segmenter("zh-CN", { granularity: "word" });
  return zhWordSegmenter;
}

function segmentWorkspaceSlugSeed(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return [];

  const segmenter = getZhWordSegmenter();
  if (!segmenter) {
    return trimmed.split(/\s+/).filter(Boolean);
  }

  return Array.from(segmenter.segment(trimmed), (item) => item.segment.trim()).filter(Boolean);
}

function transliterateWorkspaceSlugSegment(segment: string) {
  if (!HANZI_SEGMENT_REGEX.test(segment)) {
    return segment;
  }

  return pinyin(segment, {
    toneType: "none",
    type: "array",
  }).join(" ");
}

function normalizeWorkspaceSlugSeed(value: string) {
  return segmentWorkspaceSlugSeed(value).map(transliterateWorkspaceSlugSegment).join(" ");
}

export function buildWorkspaceSlug(value: string, fallback = "") {
  const normalizedSeed = normalizeWorkspaceSlugSeed(value);
  const fallbackSeed = normalizeWorkspaceSlugSeed(fallback);
  const slugSource = normalizedSeed || fallbackSeed;
  if (!slugSource) return "";

  return slugify(slugSource, {
    lower: true,
    strict: true,
    trim: true,
  }).slice(0, WORKSPACE_SLUG_MAX_LENGTH);
}

export function createProfileSeedWorkspaceSlugState(value: string): WorkspaceSlugState {
  return {
    value: buildWorkspaceSlug(value),
    source: "profile-seed",
  };
}

export function createNameSeedWorkspaceSlugState(name: string): WorkspaceSlugState {
  return {
    value: buildWorkspaceSlug(name),
    source: "name-seed",
  };
}

export function syncWorkspaceSlugWithName(
  state: WorkspaceSlugState,
  nextName: string,
): WorkspaceSlugState {
  if (state.source !== "name-seed") {
    return state;
  }

  return createNameSeedWorkspaceSlugState(nextName);
}

export function applyManualWorkspaceSlugInput(nextValue: string): WorkspaceSlugState {
  const trimmed = nextValue.trim();
  const preserveTrailingHyphen =
    trimmed.endsWith("-") &&
    trimmed.length > 1 &&
    !trimmed.endsWith("--") &&
    !trimmed.startsWith("-");
  const normalizedValue = buildWorkspaceSlug(nextValue);
  const value =
    preserveTrailingHyphen && normalizedValue.length < WORKSPACE_SLUG_MAX_LENGTH
      ? `${normalizedValue}-`
      : normalizedValue;

  return {
    value,
    source: "manual",
  };
}

export function adoptNameSeedWorkspaceSlug(nextName: string): WorkspaceSlugState {
  return createNameSeedWorkspaceSlugState(nextName);
}
