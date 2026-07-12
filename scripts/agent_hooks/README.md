# Arclayer Project Hooks

`scripts/agent_hooks` owns the shared policy and runtime used by the thin Codex adapter under `.codex/hooks`.

## Command-status protocol

Codex `PostToolUse.tool_response` can be raw output text without an exit code. The project Codex hook is therefore the
sole command-status wrapper owner declared by `.codex/hooks/status-capture-owner.json`. Its `PreToolUse` handler stores
the original command and returns an `updatedInput.command` that preserves the real shell exit status in a sidecar.
Global and project `PostToolUse` hooks only read that sidecar, so their concurrent execution order does not matter.

The shared sidecar protocol is `codex-bash-exit-status-v1`:

- root: `${AGENT_HOOK_STATE_DIR:-$HOME/.cache/agent-hooks/turn-state}`, mode `0700`;
- exit status: `exit-<session-sha256[:32]>-<tool-sha256[:32]>.status`, ASCII and mode `0600`;
- metadata: `meta-<session-sha256[:32]>-<tool-sha256[:32]>.json`, mode `0600`;
- session digest input: `codex\0<session_id>`;
- metadata retains the original command because `PostToolUse.tool_input.command` may contain the wrapper.

`SessionStart` and `UserPromptSubmit` clear the current session's prior sidecars and validation evidence. Orphaned
sidecars older than 24 hours are also removed; this duration only bounds interrupted-session residue and never changes
agent execution or validation behavior.

Run the protocol and policy fixtures with:

```bash
pnpm hooks:test
```
