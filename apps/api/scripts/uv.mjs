import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";

function parseArgs(argv) {
  const args = [...argv];
  const flags = {
    print: false,
    integration: false,
  };

  const remaining = [];
  for (const arg of args) {
    if (arg === "--print" || arg === "--dry-run") {
      flags.print = true;
      continue;
    }
    if (arg === "--integration" || arg === "--integration-tests") {
      flags.integration = true;
      continue;
    }
    remaining.push(arg);
  }

  return { flags, args: remaining };
}

function getApiRoot() {
  const scriptPath = fileURLToPath(import.meta.url);
  const scriptDir = path.dirname(scriptPath);
  return path.resolve(scriptDir, "..");
}

function buildEnv(apiRoot, flags) {
  const repoRoot = path.resolve(apiRoot, "../..");
  const uvCacheDir = path.resolve(apiRoot, ".uv-cache");

  const existingPythonPath = (process.env.PYTHONPATH ?? "").trim();
  const pythonPath = existingPythonPath
    ? `${repoRoot}${path.delimiter}${existingPythonPath}`
    : repoRoot;

  const env = {
    ...process.env,
    UV_CACHE_DIR: uvCacheDir,
    PYTHONPATH: pythonPath,
  };

  if (flags.integration) {
    env.RUN_INTEGRATION_TESTS = "1";
    // 避免本机误发真实邮件；如果测试要真正发信，应显式覆盖该值
    if ((env.MAIL__SUPPRESS_SEND ?? "").trim() === "") {
      env.MAIL__SUPPRESS_SEND = "1";
    }
  }

  return env;
}

function main() {
  const { flags, args } = parseArgs(process.argv.slice(2));
  const apiRoot = getApiRoot();
  const env = buildEnv(apiRoot, flags);

  if (args.length === 0) {
    console.error("用法: pnpm -C apps/api uv -- <要执行的命令与参数>");
    console.error("示例: pnpm -C apps/api uv -- pytest -q");
    console.error("或:   pnpm -C apps/api dev");
    process.exit(2);
  }

  const uvCommand = "uv";
  const uvArgs = args;

  if (flags.print) {
    const preview = {
      cwd: apiRoot,
      command: uvCommand,
      args: uvArgs,
      env: {
        UV_CACHE_DIR: env.UV_CACHE_DIR,
        PYTHONPATH: env.PYTHONPATH,
        RUN_INTEGRATION_TESTS: env.RUN_INTEGRATION_TESTS,
        MAIL__SUPPRESS_SEND: env.MAIL__SUPPRESS_SEND,
      },
    };
    // 仅用于本地排障与 CI 诊断，避免输出过多环境变量
    process.stdout.write(`${JSON.stringify(preview, null, 2)}\n`);
    return;
  }

  const child = spawn(uvCommand, uvArgs, {
    cwd: apiRoot,
    env,
    stdio: "inherit",
    // Windows 下 `uv` 可能以 `.cmd`/shim 形式存在，使用 shell 兼容查找
    shell: process.platform === "win32",
  });

  child.on("error", (error) => {
    console.error("执行 uv 失败:", error);
    process.exit(1);
  });

  child.on("exit", (code, signal) => {
    if (typeof code === "number") process.exit(code);
    if (signal) {
      // 128 + signal 与类 Unix 约定一致，便于上层脚本识别
      process.exit(128);
    }
    process.exit(1);
  });
}

main();
