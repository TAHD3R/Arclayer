import { CliError } from "../errors.js";
import type { CliIo } from "../io.js";

const TRANSFER_API_MISSING =
  "Content transfer CLI commands require backend transfer routes exposed through OpenAPI. The ProjectContentTransferService exists, but no HTTP route is currently generated.";

export async function runContentCommand(argv: readonly string[], _io: CliIo): Promise<number> {
  const [subcommand] = argv;
  switch (subcommand) {
    case "export":
    case "import":
      throw new CliError(TRANSFER_API_MISSING);
    case "--help":
    case "-h":
    case undefined:
      throw new CliError(TRANSFER_API_MISSING, { exitCode: 0 });
    default:
      throw new CliError(`Unknown content command: ${subcommand}`);
  }
}
