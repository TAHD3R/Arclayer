import { describe, expect, it } from "vitest";

import { OVERVIEW_DESTINATION, PLATFORM_CAPABILITY_MODULES } from "@/capabilities/module-registry";
import {
  readRecentDestinations,
  recordRecentDestination,
  resolveRecentDestinations,
} from "@/command-center/recent-destinations";

function memoryStorage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next;
    },
  };
}

const tenantDestination = PLATFORM_CAPABILITY_MODULES["tenants.workspaces"].destinations[0];
const accessDestination = PLATFORM_CAPABILITY_MODULES["access.team"].destinations[0];
const authorized = [OVERVIEW_DESTINATION, tenantDestination];

describe("typed recent Platform destinations", () => {
  it("stores trusted destination ids rather than API-provided paths or labels", () => {
    const storage = memoryStorage();

    const records = recordRecentDestination(storage, tenantDestination, authorized, 42);

    expect(records).toEqual([{ destinationId: "workspace-workspaces", visitedAt: 42 }]);
    expect(resolveRecentDestinations(records, authorized)).toEqual([tenantDestination]);
  });

  it("round-trips the build-registered Platform team destination", () => {
    const storage = memoryStorage();
    const accessAuthorized = [OVERVIEW_DESTINATION, accessDestination];

    recordRecentDestination(storage, accessDestination, accessAuthorized, 42);

    expect(readRecentDestinations(storage, accessAuthorized)).toEqual([
      { destinationId: "access-team", visitedAt: 42 },
    ]);
  });

  it("removes destinations that are no longer authorized from reads", () => {
    const storage = memoryStorage(
      JSON.stringify([
        { destinationId: "workspace-workspaces", visitedAt: 42 },
        { destinationId: "overview", visitedAt: 41 },
      ]),
    );

    expect(readRecentDestinations(storage, [OVERVIEW_DESTINATION])).toEqual([
      { destinationId: "overview", visitedAt: 41 },
    ]);
  });

  it("surfaces corrupted recent state instead of silently replacing it", () => {
    expect(() => readRecentDestinations(memoryStorage("not-json"), authorized)).toThrow();
  });
});
