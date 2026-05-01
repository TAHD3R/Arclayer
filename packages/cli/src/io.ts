import { readFile, writeFile } from "node:fs/promises";

export type CliIo = {
  stderr: (message: string) => void;
  stdout: (message: string) => void;
  readTextFile: (path: string) => Promise<string>;
  writeTextFile: (path: string, content: string) => Promise<void>;
};

export const nodeIo: CliIo = {
  stderr: (message) => {
    process.stderr.write(message);
  },
  stdout: (message) => {
    process.stdout.write(message);
  },
  readTextFile: (path) => readFile(path, "utf8"),
  writeTextFile: (path, content) => writeFile(path, content, "utf8"),
};
