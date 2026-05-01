import { CliError } from "./errors.js";

export type ParsedFlags = {
  readonly positional: readonly string[];
  readonly values: ReadonlyMap<string, string>;
};

export function parseFlags(argv: readonly string[]): ParsedFlags {
  const positional: string[] = [];
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }

    const inlineValueIndex = arg.indexOf("=");
    if (inlineValueIndex > 2) {
      values.set(arg.slice(2, inlineValueIndex), arg.slice(inlineValueIndex + 1));
      continue;
    }

    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      throw new CliError(`Missing value for --${key}`);
    }
    values.set(key, next);
    index += 1;
  }

  return { positional, values };
}

export function requiredFlag(flags: ParsedFlags, key: string): string {
  const value = flags.values.get(key);
  if (value === undefined || value.trim() === "") {
    throw new CliError(`Missing required option --${key}`);
  }
  return value;
}

export function optionalIntegerFlag(flags: ParsedFlags, key: string, defaultValue: number): number {
  const value = flags.values.get(key);
  if (value === undefined) {
    return defaultValue;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CliError(`--${key} must be a positive integer`);
  }
  return parsed;
}
