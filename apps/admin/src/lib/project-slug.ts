import slugify from "slugify";
import { pinyin } from "pinyin-pro";

export const PROJECT_SLUG_MAX_LENGTH = 64;

const HANZI_SEGMENT_REGEX = /\p{Script=Han}/u;

export type ProjectSlugSource = "name-seed" | "manual";

export type ProjectSlugState = {
  value: string;
  source: ProjectSlugSource;
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

function segmentProjectSlugSeed(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return [];

  const segmenter = getZhWordSegmenter();
  if (!segmenter) {
    return trimmed.split(/\s+/).filter(Boolean);
  }

  return Array.from(segmenter.segment(trimmed), (item) => item.segment.trim()).filter(Boolean);
}

function transliterateProjectSlugSegment(segment: string) {
  if (!HANZI_SEGMENT_REGEX.test(segment)) {
    return segment;
  }

  return pinyin(segment, {
    toneType: "none",
    type: "array",
  }).join(" ");
}

function normalizeProjectSlugSeed(value: string) {
  return segmentProjectSlugSeed(value).map(transliterateProjectSlugSegment).join(" ");
}

export function buildProjectSlug(value: string, fallback = "") {
  const normalizedSeed = normalizeProjectSlugSeed(value);
  const fallbackSeed = normalizeProjectSlugSeed(fallback);
  const slugSource = normalizedSeed || fallbackSeed;
  if (!slugSource) return "";

  return slugify(slugSource, {
    lower: true,
    strict: true,
    trim: true,
  }).slice(0, PROJECT_SLUG_MAX_LENGTH);
}

export function createNameSeedProjectSlugState(name: string): ProjectSlugState {
  return {
    value: buildProjectSlug(name),
    source: "name-seed",
  };
}

export function syncProjectSlugWithName(
  state: ProjectSlugState,
  nextName: string,
): ProjectSlugState {
  if (state.source !== "name-seed") {
    return state;
  }

  return createNameSeedProjectSlugState(nextName);
}

export function applyManualProjectSlugInput(nextValue: string): ProjectSlugState {
  const trimmed = nextValue.trim();
  const preserveTrailingHyphen =
    trimmed.endsWith("-") &&
    trimmed.length > 1 &&
    !trimmed.endsWith("--") &&
    !trimmed.startsWith("-");
  const normalizedValue = buildProjectSlug(nextValue);
  const value =
    preserveTrailingHyphen && normalizedValue.length < PROJECT_SLUG_MAX_LENGTH
      ? `${normalizedValue}-`
      : normalizedValue;

  return {
    value,
    source: "manual",
  };
}
