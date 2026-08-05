import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const ADMIN_SOURCE_ROOT = resolve(TEST_DIRECTORY, "../../../src");

function readSourceTree(directory: string): string {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return readSourceTree(path);
      return /\.tsx?$/.test(entry.name) ? [readFileSync(path, "utf8")] : [];
    })
    .join("\n");
}

describe("Agent runtime protocol v1 production gate", () => {
  it("requires the production adapter and reducer before ADR section 11 can pass", () => {
    const adminSource = readSourceTree(ADMIN_SOURCE_ROOT);
    const capabilities = {
      workspaceScopedRunApi:
        adminSource.includes("/workspaces/") &&
        adminSource.includes("/ai/threads/") &&
        adminSource.includes("/ai/runs/"),
      versionedEnvelope:
        adminSource.includes("eventVersion") &&
        adminSource.includes("eventId") &&
        adminSource.includes("sequence") &&
        adminSource.includes("cursor"),
      sequenceAndCursorReducer:
        adminSource.includes("AGENT_EVENT_SEQUENCE_INVALID") && adminSource.includes("lastCursor"),
      cursorExpiredSnapshotReplacement:
        adminSource.includes("EVENT_CURSOR_EXPIRED") && adminSource.includes("AgentRunSnapshotV1"),
      legacyCreateAndStreamRemoved: !adminSource.includes(
        "/projects/${encodeURIComponent(projectId)}/agents/runs/stream",
      ),
    };

    expect(capabilities).toEqual({
      workspaceScopedRunApi: true,
      versionedEnvelope: true,
      sequenceAndCursorReducer: true,
      cursorExpiredSnapshotReplacement: true,
      legacyCreateAndStreamRemoved: true,
    });
  });
});
