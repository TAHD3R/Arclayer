# F05: CLI Tools

> Source audit report: `../full-repo-audit-arclayer-strapi-contentful-2026-04-29.md`
> Matrix gap: CLI 工具
> Matrix category: completely missing
> Source audit anchors: sections 6, 9.1, 14, 15.
> Default batch: 4
> Coupling: high

## Objective

Create `@arclayer/cli` as the command surface for scaffolding, generators, transfer operations, configuration export/restore, and future plugin management.

## Context

- `packages/cli/` is absent.
- The audit identifies missing scaffolding, code generation, type generation, interactive CLI, config dump/restore, and plugin management commands.
- Transfer APIs will need a CLI caller after `f03-data-transfer-engine.md`.

## Scope

- Create a package under `packages/cli/`.
- Add a minimal command framework consistent with pnpm workspace conventions.
- Implement initial commands only when backing APIs exist:
  - `config dump`
  - `config restore`
  - `content export`
  - `content import`
  - generator stubs for future expansion
- Add package scripts and documentation.

## Exclusions

- Backend transfer engine implementation. That belongs to `f03-data-transfer-engine.md`.
- Plugin marketplace installation unless a follow-up task defines it.
- Non-TypeScript SDKs.

## Dependencies

- Requires `f03-data-transfer-engine.md` for export/import commands.
- Benefits from `f02-plugin-startup-integration.md` for future plugin commands.
- May use generated API clients after OpenAPI generation review.

## Required Context

- `.trellis/spec/guides/index.md`
- `docs/guidelines/testing-and-quality-gates.md`
- Monorepo package conventions from root `package.json`, `pnpm-workspace.yaml`, and `turbo.json`.

## Execution Instructions

1. Inspect existing packages for package layout and build scripts.
2. Pick a CLI command framework already present in the repo if one exists; add a new dependency only with clear rationale.
3. Create the CLI package with build, typecheck, and test scripts.
4. Wire commands to stable backend/service APIs.
5. Add command help text and examples.
6. Add tests for argument parsing and command behavior.
7. Update workspace scripts only as needed.

## Acceptance Criteria

- `packages/cli/` exists and participates in pnpm workspace commands.
- Initial commands have tests and documented usage.
- CLI failures exit non-zero and expose meaningful errors.
- No command simulates success when backing APIs fail.

## Verification

- Run CLI package tests and typecheck.
- Run the relevant monorepo check for changed packages.
- Run GitNexus `detect_changes` before commit.

## Execution Log

- Status: verified
- Last updated: 2026-05-01
- Files changed:
  - `package.json`
  - `pnpm-lock.yaml`
  - `.trellis/spec/guides/index.md`
  - `.trellis/spec/guides/cli-operational-contracts.md`
  - `packages/cli/README.md`
  - `packages/cli/package.json`
  - `packages/cli/tsconfig.json`
  - `packages/cli/tsconfig.typecheck.json`
  - `packages/cli/src/api.ts`
  - `packages/cli/src/bin.ts`
  - `packages/cli/src/commands/config.ts`
  - `packages/cli/src/commands/content.ts`
  - `packages/cli/src/commands/generate.ts`
  - `packages/cli/src/errors.ts`
  - `packages/cli/src/help.ts`
  - `packages/cli/src/index.ts`
  - `packages/cli/src/io.ts`
  - `packages/cli/src/options.ts`
  - `packages/cli/src/runner.ts`
  - `packages/cli/tests/runner.test.ts`
- Implementation notes:
  - Created `@arclayer/cli` with package scripts for `build`, `typecheck`, `lint`, `format`, and `test`.
  - Added `pnpm cli:check` as the focused root gate for the CLI package.
  - Implemented a small command runner without a CLI framework dependency.
  - Implemented `config dump` and `config restore` against the stable `/api/v1/system/settings` HTTP endpoints.
  - Added `content export`, `content import`, and `generate` command entries with explicit non-zero failures while their backing OpenAPI-exposed APIs are absent.
  - Built `dist/bin.js` and verified the generated CLI help runs with Node.
  - Added a Trellis guide spec for CLI command signatures, dump format, failure semantics, and tests.
  - GitNexus impact lookup returned `UNKNOWN` for generated/openapi-adjacent symbols because the current index did not contain those targets; live repo evidence was used for routing and API availability checks.
- Verification:
  - `pnpm -C packages/cli typecheck` passed.
  - `pnpm -C packages/cli build` passed.
  - `pnpm -C packages/cli test` passed: 8 tests.
  - `pnpm -C packages/cli lint` passed.
  - `pnpm -C packages/cli format` passed.
  - `pnpm cli:check` passed: lint, format, typecheck, test, build.
  - `node packages/cli/dist/bin.js --help` printed the CLI help successfully.
