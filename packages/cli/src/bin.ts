#!/usr/bin/env node
import { nodeIo } from "./io.js";
import { runCli } from "./runner.js";

const exitCode = await runCli(process.argv.slice(2), nodeIo);
process.exitCode = exitCode;
