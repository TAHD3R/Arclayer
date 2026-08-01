# Monorepo Development Guidelines

> Executable code-specs for Turborepo, pnpm workspace, quality gates, commits, and repository hygiene.

---

## Overview

Monorepo specs define how Arclayer packages are discovered, how tasks are run, how generated artifacts are handled, and how code changes are verified before handoff.

These rules apply across `apps/*`, `packages/*`, `scripts/*`, root package scripts, Turborepo task wiring, and repository hygiene.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Workspace Commands](./workspace-commands.md) | pnpm workspace, Turborepo, package filters, and allowed command entry points | Active |
| [Quality Gates](./quality-gates.md) | lint, format, typecheck, test, generated artifact, and evidence contracts | Active |
| [Repo Hygiene](./repo-hygiene.md) | git scope, commits, generated files, lockfiles, ignored workspaces, and cleanup rules | Active |

---

## Required Reading Before Monorepo Work

- Read `package.json`, `pnpm-workspace.yaml`, and `turbo.json` before changing root scripts, package scripts, workspace membership, or task dependencies.
- Read [Product and Platform Administration Experience Redesign](../shared/product-admin-experience-redesign.md) and [Product and Platform Separation](../shared/product-platform-separation.md) before changing either application's route inventory, administration compositions, build boundaries, or Product/Platform quality gates.
- Read package-specific specs before changing app/package code.
- Read shared specs when a change crosses API, identity, error, schema, or shared package boundaries.

**Language**: All documentation should be written in **English**.
