import archiver from "archiver";
import { createWriteStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Plugin, ResolvedConfig } from "vite";

import { formatArchiveTimestamp, resolveBuildMeta } from "./internal/build-meta.ts";

export interface ArchiveBuildOutputOptions {
  appName: string;
  version?: string;
  buildTime?: string;

  /**
   * Default: true
   */
  enabled?: boolean;

  /**
   * Output zip file name.
   * Defaults to: <appName>-<version>-<yyyyMMddHHmmss>.zip
   */
  archiveFileName?: string;
}

export function archiveBuildOutput(options: ArchiveBuildOutputOptions): Plugin {
  const enabled = options.enabled ?? true;

  let resolvedConfig: ResolvedConfig | null = null;

  return {
    name: "arclayer-archive-build-output",
    apply: "build",
    configResolved(cfg) {
      resolvedConfig = cfg;
    },
    async closeBundle() {
      if (!enabled) return;
      if (!resolvedConfig) return;

      const outDir = path.resolve(resolvedConfig.root, resolvedConfig.build.outDir);

      const meta = resolveBuildMeta({
        appName: options.appName,
        version: options.version,
        buildTime: options.buildTime,
      });

      const ts = formatArchiveTimestamp(meta.buildTime);
      const archiveFileName =
        options.archiveFileName ?? `${meta.appName}-${meta.version}-${ts}.zip`;

      const archivePath = path.resolve(outDir, archiveFileName);
      await fs.mkdir(path.dirname(archivePath), { recursive: true });

      await new Promise<void>((resolve, reject) => {
        const output = createWriteStream(archivePath);
        const archive = archiver("zip", { zlib: { level: 9 } });

        output.on("close", () => resolve());
        output.on("error", (err) => reject(err));

        archive.on("warning", (err) => {
          // Treat warnings as errors to avoid silently broken artifacts.
          reject(err);
        });
        archive.on("error", (err) => reject(err));

        archive.pipe(output);

        // Exclude zip files to avoid archiving archives.
        archive.glob("**/*", {
          cwd: outDir,
          dot: true,
          ignore: ["**/*.zip"],
        });

        void archive.finalize();
      });
    },
  };
}
