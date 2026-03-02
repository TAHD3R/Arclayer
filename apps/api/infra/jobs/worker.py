"""
Legacy Arq worker module.

Background jobs are now executed via Taskiq.

Run:
- `pnpm -C apps/api jobs:worker`
- `pnpm -C apps/api jobs:scheduler`

Entry points:
- broker: `apps.api.infra.jobs.taskiq_app:broker`
- scheduler: `apps.api.infra.jobs.taskiq_app:scheduler`
- tasks: `apps.api.infra.jobs.tasks`
"""
