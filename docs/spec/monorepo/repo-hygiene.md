# Monorepo Repo Hygiene

This code-spec defines repository hygiene for git scope, commits, ignored files, generated artifacts, and cleanup in Arclayer.

## Scenario: Keeping Monorepo Changes Reviewable

### 1. Scope / Trigger

- Trigger: staging, committing, moving files, generating artifacts, changing lockfiles, touching ignored workspaces, or cleaning up after tasks.
- Applies to all tracked files and local planning workspaces.

### 2. Signatures

- Git status command: `git status --short`
- Git diff command: `git diff -- <path>`
- Do-not-touch defaults:
  - `node_modules/**`
  - `.venv/**`
  - `.uv-cache/**`
  - `.turbo/**`
  - `dist/**`
  - `build/**`
  - lockfiles unless dependency changes require them
- Commit style: Conventional Commits when a commit message is requested

### 3. Contracts

- Keep diffs scoped to the requested task. Do not reformat, rename, regenerate, or clean unrelated files.
- Do not edit lockfiles unless the task changes dependencies or package resolution. When a lockfile changes, explain the dependency reason.
- Do not edit generated artifacts by hand. Regenerate through the owning script and review the generated diff.
- Do not revert user changes. If unrelated changes exist, leave them alone; if they overlap with the current task, work with the current file state.
- Stage only files that belong to the current task. Do not stage broad worktree changes.
- Create commits only when the task expectation includes committing work. Use the branch/repo style and include verification evidence in the handoff.
- Remove temporary screenshots, local CSVs, scratch artifacts, and generated caches when they are not intentional deliverables.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Lockfile changed unexpectedly | Stop and identify dependency/source cause before proceeding |
| Generated artifact changed | Confirm the owning generation command and source change |
| Unrelated user changes are present | Do not revert or stage them |
| Temporary artifact created | Delete it before handoff unless it is requested evidence |
| Commit requested | Stage only task files and use an English Conventional Commit message |
| Spec/task record changed | Verify indexes, links, JSONL path references, and PRD state |

### 5. Good/Base/Bad Cases

- Good: an API schema change generates migration/OpenAPI artifacts through scripts and reviews the generated output.
- Good: a commit stages only the files changed by the current task.
- Base: a generated artifact is included because the task changed its source schema and the generation command was run.
- Bad: lockfile churn is committed after running an unrelated install.
- Bad: unrelated user edits are reverted to make the worktree look tidy.

### 6. Tests Required

- Before handoff, check the files changed by the task, not only tracked git state.
- Before commit, run `git status --short` and inspect staged files.
- For generated artifacts, compare generated output with source changes and run the owning package check.

### 7. Wrong vs Correct

#### Wrong

```text
git status is clean, so the spec task is complete.
```

#### Correct

```text
The relevant ignored planning files were checked directly because they do not appear in normal git status.
```

Ignored planning files require direct verification when they are part of the task.
