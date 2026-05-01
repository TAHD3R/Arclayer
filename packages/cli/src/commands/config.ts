import type { CliApi } from "../api.js";
import { createHttpCliApi, parseConfigDump } from "../api.js";
import { CliError } from "../errors.js";
import type { CliIo } from "../io.js";
import { optionalIntegerFlag, parseFlags, requiredFlag } from "../options.js";

export type ConfigCommandDependencies = {
  readonly createApi?: (options: { apiUrl: string; token: string }) => CliApi;
};

export async function runConfigCommand(
  argv: readonly string[],
  io: CliIo,
  deps: ConfigCommandDependencies = {},
): Promise<number> {
  const [subcommand, ...rest] = argv;
  const flags = parseFlags(rest);
  const createApi = deps.createApi ?? createHttpCliApi;

  switch (subcommand) {
    case "dump": {
      const api = createApi({
        apiUrl: requiredFlag(flags, "api-url"),
        token: requiredFlag(flags, "token"),
      });
      const pageSize = optionalIntegerFlag(flags, "page-size", 100);
      const dump = await api.dumpConfig({ pageSize });
      const payload = `${JSON.stringify(dump, null, 2)}\n`;
      const out = flags.values.get("out");
      if (out === undefined) {
        io.stdout(payload);
      } else {
        await io.writeTextFile(out, payload);
      }
      return 0;
    }
    case "restore": {
      const api = createApi({
        apiUrl: requiredFlag(flags, "api-url"),
        token: requiredFlag(flags, "token"),
      });
      const file = requiredFlag(flags, "file");
      const dump = parseConfigDump(JSON.parse(await io.readTextFile(file)));
      const restored = await api.restoreConfig(dump);
      io.stdout(`Restored ${restored.length} config namespace(s): ${restored.join(", ")}\n`);
      return 0;
    }
    case "--help":
    case "-h":
    case undefined:
      throw new CliError("Usage: arclayer config <dump|restore> [options]", { exitCode: 0 });
    default:
      throw new CliError(`Unknown config command: ${subcommand}`);
  }
}
