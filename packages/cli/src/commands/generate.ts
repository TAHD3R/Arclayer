import { CliError } from "../errors.js";
import type { CliIo } from "../io.js";

export async function runGenerateCommand(_argv: readonly string[], _io: CliIo): Promise<number> {
  throw new CliError("Generator CLI contracts are reserved for a follow-up task.");
}
