import type { BlockPattern } from "../block-registry";
import { HERO_PATTERNS } from "./hero-patterns";
import { FEATURE_PATTERNS } from "./feature-patterns";
import { PRICING_PATTERNS } from "./pricing-patterns";

export const CORE_BLOCK_PATTERNS: BlockPattern[] = [
  ...HERO_PATTERNS,
  ...FEATURE_PATTERNS,
  ...PRICING_PATTERNS,
];
