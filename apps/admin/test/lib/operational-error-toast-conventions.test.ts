import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC_ROOT = path.resolve(import.meta.dirname, "../../src");
const FORBIDDEN_OPERATION_ERROR_PATTERNS = [/OPERATION_FAILED_TITLE/, /\bcommandError\b/];

async function listProductSources(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => listProductSources(path.join(directory, entry.name))),
  );
  const sources = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".tsx"))
    .map((entry) => path.join(directory, entry.name));
  return [...sources, ...nested.flat()];
}

describe("operational error presentation", () => {
  it("uses global toasts instead of page-level command error alerts", async () => {
    const files = await listProductSources(SRC_ROOT);
    const violations: string[] = [];

    for (const file of files) {
      const source = await fs.readFile(file, "utf8");
      if (FORBIDDEN_OPERATION_ERROR_PATTERNS.some((pattern) => pattern.test(source))) {
        violations.push(path.relative(SRC_ROOT, file));
      }
    }

    expect(violations).toEqual([]);
  });
});
