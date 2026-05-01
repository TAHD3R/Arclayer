import { runConfigCommand, type ConfigCommandDependencies } from "./commands/config.js";
import { runContentCommand } from "./commands/content.js";
import { runGenerateCommand } from "./commands/generate.js";
import { CliError, getErrorMessage } from "./errors.js";
import { CONFIG_HELP, CONTENT_HELP, GENERATE_HELP, ROOT_HELP } from "./help.js";
import type { CliIo } from "./io.js";

export type RunCliDependencies = ConfigCommandDependencies;

export async function runCli(
  argv: readonly string[],
  io: CliIo,
  deps: RunCliDependencies = {},
): Promise<number> {
  try {
    const [command, ...rest] = argv;
    switch (command) {
      case "config":
        return await runConfigCommand(rest, io, deps);
      case "content":
        return await runContentCommand(rest, io);
      case "generate":
        return await runGenerateCommand(rest, io);
      case "--help":
      case "-h":
      case undefined:
        io.stdout(ROOT_HELP);
        return 0;
      default:
        throw new CliError(`Unknown command: ${command}`);
    }
  } catch (error) {
    if (error instanceof CliError && error.exitCode === 0) {
      writeHelpFor(argv, io);
      return 0;
    }
    io.stderr(`${getErrorMessage(error)}\n`);
    return error instanceof CliError ? error.exitCode : 1;
  }
}

function writeHelpFor(argv: readonly string[], io: CliIo): void {
  switch (argv[0]) {
    case "config":
      io.stdout(CONFIG_HELP);
      return;
    case "content":
      io.stdout(CONTENT_HELP);
      return;
    case "generate":
      io.stdout(GENERATE_HELP);
      return;
    default:
      io.stdout(ROOT_HELP);
  }
}
