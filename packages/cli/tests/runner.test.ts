import { describe, expect, it, vi } from "vitest";

import type { CliApi, ConfigDump } from "../src/index.js";
import { createHttpCliApi, runCli } from "../src/index.js";
import type { CliIo } from "../src/io.js";

function createIo(files: Record<string, string> = {}) {
  const writes = new Map<string, string>();
  const stdout = vi.fn();
  const stderr = vi.fn();
  const io: CliIo = {
    readTextFile: async (path) => {
      const value = files[path];
      if (value === undefined) {
        throw new Error(`Missing test file: ${path}`);
      }
      return value;
    },
    stderr,
    stdout,
    writeTextFile: async (path, content) => {
      writes.set(path, content);
    },
  };
  return { io, stderr, stdout, writes };
}

function createApi(dump: ConfigDump): CliApi {
  return {
    dumpConfig: vi.fn(async () => dump),
    restoreConfig: vi.fn(async (payload: ConfigDump) =>
      payload.namespaces.map((item) => item.namespace),
    ),
  };
}

const CONFIG_DUMP: ConfigDump = {
  exportedAt: "2026-05-01T00:00:00.000Z",
  format: "arclayer.config.dump",
  namespaces: [
    {
      namespace: "storage",
      value: {
        publicDeliveryMode: "direct",
      },
    },
  ],
  version: 1,
};

describe("arclayer cli", () => {
  it("prints root help", async () => {
    const { io, stdout, stderr } = createIo();

    const exitCode = await runCli(["--help"], io);

    expect(exitCode).toBe(0);
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining("config dump"));
    expect(stderr).not.toHaveBeenCalled();
  });

  it("dumps config to stdout through injected API", async () => {
    const { io, stdout, stderr } = createIo();
    const api = createApi(CONFIG_DUMP);

    const exitCode = await runCli(
      ["config", "dump", "--api-url", "https://api.example.test", "--token", "token"],
      io,
      { createApi: () => api },
    );

    expect(exitCode).toBe(0);
    expect(stdout).toHaveBeenCalledWith(`${JSON.stringify(CONFIG_DUMP, null, 2)}\n`);
    expect(stderr).not.toHaveBeenCalled();
    expect(api.dumpConfig).toHaveBeenCalledWith({ pageSize: 100 });
  });

  it("dumps config to a file", async () => {
    const { io, writes } = createIo();
    const api = createApi(CONFIG_DUMP);

    const exitCode = await runCli(
      [
        "config",
        "dump",
        "--api-url=https://api.example.test",
        "--token=token",
        "--out",
        "config.json",
        "--page-size",
        "25",
      ],
      io,
      { createApi: () => api },
    );

    expect(exitCode).toBe(0);
    expect(writes.get("config.json")).toBe(`${JSON.stringify(CONFIG_DUMP, null, 2)}\n`);
    expect(api.dumpConfig).toHaveBeenCalledWith({ pageSize: 25 });
  });

  it("restores config from a dump file", async () => {
    const { io, stdout } = createIo({
      "config.json": JSON.stringify(CONFIG_DUMP),
    });
    const api = createApi(CONFIG_DUMP);

    const exitCode = await runCli(
      [
        "config",
        "restore",
        "--api-url",
        "https://api.example.test",
        "--token",
        "token",
        "--file",
        "config.json",
      ],
      io,
      { createApi: () => api },
    );

    expect(exitCode).toBe(0);
    expect(api.restoreConfig).toHaveBeenCalledWith(CONFIG_DUMP);
    expect(stdout).toHaveBeenCalledWith("Restored 1 config namespace(s): storage\n");
  });

  it("fails when required options are missing", async () => {
    const { io, stderr } = createIo();

    const exitCode = await runCli(["config", "dump", "--api-url", "https://api.example.test"], io, {
      createApi: () => createApi(CONFIG_DUMP),
    });

    expect(exitCode).toBe(1);
    expect(stderr).toHaveBeenCalledWith("Missing required option --token\n");
  });

  it("exposes content transfer commands as explicit non-zero failures until routes exist", async () => {
    const { io, stderr } = createIo();

    const exitCode = await runCli(["content", "export"], io);

    expect(exitCode).toBe(1);
    expect(stderr).toHaveBeenCalledWith(
      expect.stringContaining("require backend transfer routes exposed through OpenAPI"),
    );
  });

  it("exposes generator commands as explicit non-zero failures", async () => {
    const { io, stderr } = createIo();

    const exitCode = await runCli(["generate", "content-model"], io);

    expect(exitCode).toBe(1);
    expect(stderr).toHaveBeenCalledWith(
      "Generator CLI contracts are reserved for a follow-up task.\n",
    );
  });

  it("uses the stable settings HTTP endpoints for config dump and restore", async () => {
    const requests: Request[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      requests.push(request);

      if (request.url.endsWith("/api/v1/system/settings?page=1&size=50")) {
        return jsonResponse({
          data: {
            items: [{ kind: "core", namespace: "storage", title: "Storage" }],
            next: null,
            page: 1,
            pages: 1,
            size: 50,
            total: 1,
          },
        });
      }

      if (request.url.endsWith("/api/v1/system/settings/storage") && request.method === "GET") {
        return jsonResponse({
          data: {
            namespace: "storage",
            settingSchema: { sections: [] },
            value: { publicDeliveryMode: "direct" },
          },
        });
      }

      if (request.url.endsWith("/api/v1/system/settings/storage") && request.method === "PATCH") {
        expect(await request.json()).toEqual({ patch: { publicDeliveryMode: "direct" } });
        return jsonResponse({
          data: {
            namespace: "storage",
            settingSchema: { sections: [] },
            value: { publicDeliveryMode: "direct" },
          },
        });
      }

      return jsonResponse({ error: "unexpected request" }, { status: 500 });
    });

    const api = createHttpCliApi({
      apiUrl: "https://api.example.test",
      fetch: fetchMock as typeof fetch,
      token: "token",
    });

    const dump = await api.dumpConfig({ pageSize: 50 });
    const restored = await api.restoreConfig(dump);

    expect(dump.namespaces).toEqual([
      { namespace: "storage", value: { publicDeliveryMode: "direct" } },
    ]);
    expect(restored).toEqual(["storage"]);
    expect(requests.map((request) => request.headers.get("authorization"))).toEqual([
      "Bearer token",
      "Bearer token",
      "Bearer token",
    ]);
  });
});

function jsonResponse(payload: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}
