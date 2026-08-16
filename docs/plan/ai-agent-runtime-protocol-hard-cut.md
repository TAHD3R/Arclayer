# Agent 运行时协议迁移硬切计划（未执行）

- 来源：自 `docs/spec/shared/ai-agent-runtime-protocol.md` §10 拆出（2026-08-17）
- 状态：**未执行**。证据：generic `/chat` 旧路由族仍挂载于 `apps/api/src/core/routes.py`；协议契约 §11 验收门自标 PARTIALLY EXECUTED（完整浏览器垂直夹具未通过前硬切被禁止）
- 权威关系：协议本体（事件契约、持久化、线协议、适配器、验收门）仍以 ai-agent-runtime-protocol 契约为准；决策记录见 ADR-0073

以下为迁移原文。

## Migration and hard cut

Migration is an observed temporary bridge followed by one canonical path:

1. add normalized thread/message/part/run/step/Tool/approval/delegation tables and the append-only `AIRunEvent` table with event schema validation and sequence constraints.
2. add the canonical workspace Thread/Run/Tool-response APIs, including separated create, snapshot, event, resume, and cancel resources, plus generated clients.
3. temporarily dual-write the current event JSON array and `AIRunEvent` only while parity fixtures run. New readers use the normalized path; there is no read fallback from normalized state to the array.
4. backfill each valid legacy event array in stored order with sequences `1..N`, generated event IDs/cursors, `eventVersion: 1`, mapped payloads, and recorded hashes. Missing historical facts are not invented. Invalid or unmappable records are explicitly quarantined/archived with migration evidence.
5. run count, order, hash, owner, replay, terminal, cancellation, and Credits parity fixtures while old writes are frozen.
6. switch the Product Application reducer/runtime adapter and backend routes together. Zustand becomes transient UI state, and stream disconnect changes from cancel to detach.
7. hard cut Toolkit renderer registration and nested delegation/approval mappings.
8. remove generic `/chat`, `/chat/workspace-actions`, the old `POST /projects/{project_id}/agents/runs/stream` endpoint, whole-array event authority, disconnect-cancels-run behavior and the `test_stream_project_agent_run_cancels_created_run_on_disconnect` expectation, text-directive routing authority, deprecated Tool UI registration, temporary dual write, and compatibility facades in the same rollout.
9. remove obsolete columns/tables only after rollback evidence is captured. After destructive cleanup, recovery is forward repair rather than re-enabling the legacy route.

The hard cut is forbidden until all section 11 gates of the protocol contract pass against the normalized store and new browser adapter.
