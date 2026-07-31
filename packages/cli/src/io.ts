export type CliIo = {
  stderr: (message: string) => void;
  stdout: (message: string) => void;
};

export const nodeIo: CliIo = {
  stderr: (message) => {
    process.stderr.write(message);
  },
  stdout: (message) => {
    process.stdout.write(message);
  },
};
