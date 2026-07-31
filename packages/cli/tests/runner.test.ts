import { describe, expect, it, vi } from "vitest";

import { runCli } from "../src/index.js";
import type { CliIo } from "../src/io.js";

function createIo() {
  const stdout = vi.fn();
  const stderr = vi.fn();
  const io: CliIo = { stderr, stdout };
  return { io, stderr, stdout };
}

describe("arclayer cli", () => {
  it("prints root help without the removed global configuration commands", async () => {
    const { io, stdout, stderr } = createIo();

    const exitCode = await runCli(["--help"], io);

    expect(exitCode).toBe(0);
    expect(stdout).toHaveBeenCalledWith(expect.not.stringContaining("config dump"));
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining("content export"));
    expect(stderr).not.toHaveBeenCalled();
  });

  it("rejects the removed global configuration command", async () => {
    const { io, stderr } = createIo();

    const exitCode = await runCli(["config", "dump"], io);

    expect(exitCode).toBe(1);
    expect(stderr).toHaveBeenCalledWith("Unknown command: config\n");
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
});
