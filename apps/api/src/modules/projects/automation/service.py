from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

import httpx
from tortoise.exceptions import IntegrityError

from src.agents import (
    AgentRunContext,
    AgentRunEngine,
    AgentRunStatus,
    AgentSessionManager,
    build_default_agent_registry,
)
from src.agents.engine import AgentChatService
from src.agents.tools import build_read_only_content_tools
from src.config import Settings
from src.core.entity_manager.manager import EntityManager
from src.core.events import Event
from src.core.exceptions import BadRequest, Conflict, NotFound, ServiceUnavailable
from src.core.i18n import t
from src.core.lifecycles.dispatcher import LifecycleDispatcher
from src.core.logging import get_logger
from src.core.services import BaseService
from src.models.automation.flow import (
    AutomationFlow,
    AutomationFlowStatus,
    AutomationOperation,
    AutomationOperationKind,
    AutomationRun,
    AutomationRunLogLevel,
    AutomationRunStatus,
    AutomationTriggerKind,
)
from src.models.system.notification import NotificationCategory
from src.modules.ai.service import AIChatService
from src.modules.projects.agents.repository import AgentRunRepository
from src.modules.projects.automation.catalog import (
    list_global_automation_operation_kinds,
    list_global_automation_triggers,
    list_project_automation_operation_kinds,
    list_project_automation_triggers,
    trigger_definition_for_event,
    trigger_definition_for_kind,
    validate_operation_config,
)
from src.modules.projects.automation.repository import AutomationRepository
from src.modules.projects.automation.schema import (
    AutomationCatalogOut,
    AutomationFlowCreateIn,
    AutomationFlowListOut,
    AutomationFlowOut,
    AutomationFlowPatchIn,
    AutomationOperationKindOut,
    AutomationOperationOut,
    AutomationRunListOut,
    AutomationRunLogOut,
    AutomationRunOut,
    AutomationTriggerOut,
)
from src.modules.projects.content.items.canonical_service import ProjectContentCanonicalItemsService
from src.modules.projects.content.items.input_schema import ContentItemWorkflowPatchIn
from src.modules.projects.content.items.read_service import ProjectContentCanonicalItemReadService
from src.modules.projects.content.items.repository import ProjectContentItemsRepository
from src.modules.projects.content.models.canonical_service import ProjectContentCanonicalModelsService
from src.modules.projects.content.models.repository import ProjectContentModelsRepository
from src.modules.projects.releases.service import ProjectReleasesService
from src.modules.system.admin.notifications.catalog import (
    NotificationRecordCreateDisposition,
    create_notification_record,
)
from src.modules.system.admin.notifications.schema import validate_notification_navigation_target
from src.modules.tenancy.router_helpers import bind_tenant_context, require_tenant_context_from_payload
from src.modules.tenancy.schema import TenantContext

logger = get_logger(__name__)
DEFAULT_HTTP_TIMEOUT_S = 5.0
DEFAULT_AGENT_ANALYSIS_PROMPT = (
    "Analyze the newly created content item. Return read-only observations, quality risks, SEO suggestions, "
    "and editorial next steps. Do not modify content, publish content, or claim that any mutation happened."
)

ContentReadServiceFactory = Callable[[TenantContext], ProjectContentCanonicalItemReadService]
ContentModelReadServiceFactory = Callable[[TenantContext, Settings], ProjectContentCanonicalModelsService]
ContentItemsServiceFactory = Callable[[TenantContext, LifecycleDispatcher | None], ProjectContentCanonicalItemsService]
ReleaseServiceFactory = Callable[[TenantContext], ProjectReleasesService]
AgentChatServiceFactory = Callable[[Settings], AgentChatService]


def default_content_read_service_factory(tenant_context: TenantContext) -> ProjectContentCanonicalItemReadService:
    return ProjectContentCanonicalItemReadService(repo=ProjectContentItemsRepository(tenant_context))


def default_content_model_read_service_factory(
    tenant_context: TenantContext,
    settings: Settings,
) -> ProjectContentCanonicalModelsService:
    return ProjectContentCanonicalModelsService(
        repo=ProjectContentModelsRepository(tenant_context),
        settings=settings,
    )


def default_content_items_service_factory(
    tenant_context: TenantContext,
    lifecycle_dispatcher: LifecycleDispatcher | None,
) -> ProjectContentCanonicalItemsService:
    repo = ProjectContentItemsRepository(tenant_context)
    return ProjectContentCanonicalItemsService(
        repo=repo,
        entity_manager=EntityManager(items_repo=repo, lifecycle=lifecycle_dispatcher),
    )


def default_release_service_factory(tenant_context: TenantContext) -> ProjectReleasesService:
    return ProjectReleasesService(tenant_context)


def default_agent_chat_service_factory(settings: Settings) -> AgentChatService:
    return AIChatService(settings)


def default_agent_session_manager() -> AgentSessionManager:
    return AgentSessionManager(store=AgentRunRepository())


class ProjectAutomationService(BaseService):
    def __init__(
        self,
        settings: Settings | None = None,
        repo: AutomationRepository | None = None,
        lifecycle_dispatcher: LifecycleDispatcher | None = None,
        content_read_service_factory: ContentReadServiceFactory = default_content_read_service_factory,
        content_model_read_service_factory: ContentModelReadServiceFactory = default_content_model_read_service_factory,
        content_items_service_factory: ContentItemsServiceFactory = default_content_items_service_factory,
        release_service_factory: ReleaseServiceFactory = default_release_service_factory,
        agent_chat_service_factory: AgentChatServiceFactory = default_agent_chat_service_factory,
        agent_sessions: AgentSessionManager | None = None,
    ) -> None:
        super().__init__(settings)
        self.repo = repo or AutomationRepository()
        self.lifecycle_dispatcher = lifecycle_dispatcher
        self.content_read_service_factory = content_read_service_factory
        self.content_model_read_service_factory = content_model_read_service_factory
        self.content_items_service_factory = content_items_service_factory
        self.release_service_factory = release_service_factory
        self.agent_chat_service_factory = agent_chat_service_factory
        self.agent_sessions = agent_sessions or default_agent_session_manager()

    async def get_catalog_out(self) -> AutomationCatalogOut:
        return await self.get_global_catalog_out()

    async def get_global_catalog_out(self) -> AutomationCatalogOut:
        return self._build_catalog_out(
            triggers=list_global_automation_triggers(),
            operations=list_global_automation_operation_kinds(),
        )

    async def get_project_catalog_out(self) -> AutomationCatalogOut:
        return self._build_catalog_out(
            triggers=list_project_automation_triggers(),
            operations=list_project_automation_operation_kinds(),
        )

    @staticmethod
    def _build_catalog_out(
        *,
        triggers: tuple[Any, ...] | list[Any],
        operations: tuple[Any, ...] | list[Any],
    ) -> AutomationCatalogOut:
        return AutomationCatalogOut(
            triggers=[
                AutomationTriggerOut(
                    kind=definition.kind,
                    event_name=definition.event_name,
                    label=definition.label,
                    description=definition.description,
                )
                for definition in triggers
            ],
            operations=[
                AutomationOperationKindOut(
                    kind=definition.kind,
                    label=definition.label,
                    description=definition.description,
                    required_fields=list(definition.required_fields),
                )
                for definition in operations
            ],
        )

    async def list_flows_out(self, *, workspace_id: UUID) -> AutomationFlowListOut:
        flows = await self.repo.list_flows(workspace_id=workspace_id)
        return AutomationFlowListOut(items=[await self._to_flow_out(flow) for flow in flows])

    async def list_project_flows_out(self, *, workspace_id: UUID, project_id: UUID) -> AutomationFlowListOut:
        flows = await self.repo.list_project_flows(workspace_id=workspace_id, project_id=project_id)
        return AutomationFlowListOut(items=[await self._to_flow_out(flow) for flow in flows])

    async def create_flow_out(
        self,
        *,
        workspace_id: UUID,
        actor_user_id: UUID | None,
        payload: AutomationFlowCreateIn,
    ) -> AutomationFlowOut:
        self._validate_global_scope_payload(payload)
        trigger_kind = AutomationTriggerKind(str(payload.trigger_kind))
        trigger = trigger_definition_for_kind(trigger_kind)
        operations = self._normalize_operations(payload.operations)
        try:
            flow = await self.repo.create_flow(
                workspace_id=workspace_id,
                name=payload.name,
                description=payload.description,
                status=AutomationFlowStatus(str(payload.status)),
                trigger_kind=trigger_kind,
                trigger_event=trigger.event_name,
                retry_limit=payload.retry_limit,
                dead_letter_enabled=payload.dead_letter_enabled,
                credential_binding=payload.credential_binding,
                created_by_user_id=actor_user_id,
                operations=operations,
            )
        except IntegrityError as exc:
            raise Conflict("Automation flow already exists", error="AUTOMATION_FLOW_CONFLICT") from exc
        return await self._to_flow_out(flow)

    async def create_project_flow_out(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        actor_user_id: UUID | None,
        payload: AutomationFlowCreateIn,
    ) -> AutomationFlowOut:
        self._validate_project_scope_payload(payload)
        credential_binding = dict(payload.credential_binding or {})
        credential_binding["projectId"] = str(project_id)
        trigger_kind = AutomationTriggerKind(str(payload.trigger_kind))
        trigger = trigger_definition_for_kind(trigger_kind)
        operations = self._normalize_operations(payload.operations)
        try:
            flow = await self.repo.create_flow(
                workspace_id=workspace_id,
                name=payload.name,
                description=payload.description,
                status=AutomationFlowStatus(str(payload.status)),
                trigger_kind=trigger_kind,
                trigger_event=trigger.event_name,
                retry_limit=payload.retry_limit,
                dead_letter_enabled=payload.dead_letter_enabled,
                credential_binding=credential_binding,
                created_by_user_id=actor_user_id,
                operations=operations,
            )
        except IntegrityError as exc:
            raise Conflict("Automation flow already exists", error="AUTOMATION_FLOW_CONFLICT") from exc
        return await self._to_flow_out(flow)

    async def update_flow_out(
        self,
        *,
        workspace_id: UUID,
        flow_id: UUID,
        actor_user_id: UUID | None,
        payload: AutomationFlowPatchIn,
    ) -> AutomationFlowOut:
        flow = await self._get_flow_or_raise(workspace_id=workspace_id, flow_id=flow_id)
        self._validate_global_scope_patch(payload)
        fields: dict[str, Any] = {"updated_by_user_id": actor_user_id}
        if payload.name is not None:
            fields["name"] = payload.name
        if payload.description is not None:
            fields["description"] = payload.description
        if payload.status is not None:
            fields["status"] = AutomationFlowStatus(str(payload.status))
        if payload.retry_limit is not None:
            fields["retry_limit"] = payload.retry_limit
        if payload.dead_letter_enabled is not None:
            fields["dead_letter_enabled"] = payload.dead_letter_enabled
        if payload.credential_binding is not None:
            fields["credential_binding"] = payload.credential_binding
        operations = self._normalize_operations(payload.operations) if payload.operations is not None else None
        try:
            flow = await self.repo.update_flow(flow, fields=fields, operations=operations)
        except IntegrityError as exc:
            raise Conflict("Automation flow already exists", error="AUTOMATION_FLOW_CONFLICT") from exc
        return await self._to_flow_out(flow)

    async def update_project_flow_out(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        flow_id: UUID,
        actor_user_id: UUID | None,
        payload: AutomationFlowPatchIn,
    ) -> AutomationFlowOut:
        flow = await self._get_project_flow_or_raise(
            workspace_id=workspace_id,
            project_id=project_id,
            flow_id=flow_id,
        )
        self._validate_project_scope_patch(payload)
        fields: dict[str, Any] = {"updated_by_user_id": actor_user_id}
        if payload.name is not None:
            fields["name"] = payload.name
        if payload.description is not None:
            fields["description"] = payload.description
        if payload.status is not None:
            fields["status"] = AutomationFlowStatus(str(payload.status))
        if payload.retry_limit is not None:
            fields["retry_limit"] = payload.retry_limit
        if payload.dead_letter_enabled is not None:
            fields["dead_letter_enabled"] = payload.dead_letter_enabled
        if payload.credential_binding is not None:
            credential_binding = dict(payload.credential_binding)
            credential_binding["projectId"] = str(project_id)
            fields["credential_binding"] = credential_binding
        operations = self._normalize_operations(payload.operations) if payload.operations is not None else None
        try:
            flow = await self.repo.update_flow(flow, fields=fields, operations=operations)
        except IntegrityError as exc:
            raise Conflict("Automation flow already exists", error="AUTOMATION_FLOW_CONFLICT") from exc
        return await self._to_flow_out(flow)

    async def delete_flow(self, *, workspace_id: UUID, flow_id: UUID) -> None:
        deleted = await self.repo.delete_flow(workspace_id=workspace_id, flow_id=flow_id)
        if deleted <= 0:
            raise NotFound(message=t("errors", "NOT_FOUND"), error="AUTOMATION_FLOW_NOT_FOUND")

    async def delete_project_flow(self, *, workspace_id: UUID, project_id: UUID, flow_id: UUID) -> None:
        deleted = await self.repo.delete_project_flow(
            workspace_id=workspace_id,
            project_id=project_id,
            flow_id=flow_id,
        )
        if deleted <= 0:
            raise NotFound(message=t("errors", "NOT_FOUND"), error="AUTOMATION_FLOW_NOT_FOUND")

    async def list_runs_out(self, *, workspace_id: UUID, limit: int = 50) -> AutomationRunListOut:
        runs = await self.repo.list_runs(workspace_id=workspace_id, limit=limit)
        return AutomationRunListOut(items=[await self._to_run_out(run, include_logs=False) for run in runs])

    async def list_project_runs_out(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        limit: int = 50,
    ) -> AutomationRunListOut:
        runs = await self.repo.list_project_runs(workspace_id=workspace_id, project_id=project_id, limit=limit)
        return AutomationRunListOut(items=[await self._to_run_out(run, include_logs=False) for run in runs])

    async def get_run_out(self, *, workspace_id: UUID, run_id: UUID) -> AutomationRunOut:
        run = await self.repo.get_run(workspace_id=workspace_id, run_id=run_id)
        if run is None:
            raise NotFound(message=t("errors", "NOT_FOUND"), error="AUTOMATION_RUN_NOT_FOUND")
        return await self._to_run_out(run, include_logs=True)

    async def get_project_run_out(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        run_id: UUID,
    ) -> AutomationRunOut:
        run = await self.repo.get_project_run(workspace_id=workspace_id, project_id=project_id, run_id=run_id)
        if run is None:
            raise NotFound(message=t("errors", "NOT_FOUND"), error="AUTOMATION_RUN_NOT_FOUND")
        return await self._to_run_out(run, include_logs=True)

    async def handle_event(self, event: Event) -> list[AutomationRunOut]:
        trigger = trigger_definition_for_event(event.name)
        if trigger is None:
            return []
        workspace_id = self._workspace_id_from_payload(event.payload)
        if workspace_id is None:
            return []
        tenant_context = (
            require_tenant_context_from_payload(event.payload)
            if isinstance(event.payload, dict) and "tenant" in event.payload
            else None
        )
        if tenant_context is not None:
            bind_tenant_context(tenant_context)
        project_id = self._project_id_from_event_payload(event.payload)
        if project_id is not None:
            flows = await self.repo.list_enabled_project_flows_for_event(
                workspace_id=workspace_id,
                project_id=project_id,
                event_name=event.name,
            )
        else:
            flows = await self.repo.list_enabled_flows_for_event(workspace_id=workspace_id, event_name=event.name)
        results: list[AutomationRunOut] = []
        for flow in flows:
            results.append(await self.execute_flow(flow=flow, event=event))
        return results

    async def execute_flow(self, *, flow: AutomationFlow, event: Event) -> AutomationRunOut:
        payload = dict(event.payload or {})
        max_attempts = max(1, int(flow.retry_limit or 0) + 1)
        run = await self.repo.create_run(
            workspace_id=flow.workspace_id,
            flow_id=flow.id,
            trigger_event=event.name,
            event_payload=payload,
            max_attempts=max_attempts,
        )
        await self.repo.update_run(run, status=AutomationRunStatus.RUNNING, started_at=datetime.now(tz=UTC))
        operations = await self.repo.list_operations(flow_id=flow.id)
        result_payload: dict[str, Any] = {"operations": []}
        try:
            for operation in operations:
                operation_result = await self._execute_operation(run=run, operation=operation, event=event)
                result_payload["operations"].append(operation_result)
            await self.repo.create_log(
                workspace_id=flow.workspace_id,
                run_id=run.id,
                operation_id=None,
                level=AutomationRunLogLevel.INFO,
                message="Automation run completed.",
                payload={"operationCount": len(operations)},
            )
            run = await self.repo.update_run(
                run,
                status=AutomationRunStatus.SUCCEEDED,
                result_payload=result_payload,
                completed_at=datetime.now(tz=UTC),
            )
        except Exception as exc:
            status = AutomationRunStatus.DEAD_LETTER if flow.dead_letter_enabled else AutomationRunStatus.FAILED
            await self.repo.create_log(
                workspace_id=flow.workspace_id,
                run_id=run.id,
                operation_id=None,
                level=AutomationRunLogLevel.ERROR,
                message="Automation run failed.",
                payload={"error": str(exc), "status": status.value},
            )
            run = await self.repo.update_run(
                run,
                status=status,
                error=str(exc),
                completed_at=datetime.now(tz=UTC),
            )
            logger.warning(
                "Automation run failed",
                flow_id=str(flow.id),
                run_id=str(run.id),
                status=status.value,
                error=str(exc),
            )
        return await self._to_run_out(run, include_logs=True)

    def _normalize_operations(
        self,
        operations: list[Any],
    ) -> list[tuple[str, AutomationOperationKind, dict[str, Any] | None, int]]:
        normalized: list[tuple[str, AutomationOperationKind, dict[str, Any] | None, int]] = []
        for index, operation in enumerate(operations):
            kind = AutomationOperationKind(str(operation.kind))
            config = validate_operation_config(kind, operation.config)
            normalized.append((operation.name, kind, config, operation.sort_order if operation.sort_order else index))
        return normalized

    @staticmethod
    def _validate_global_scope_payload(payload: AutomationFlowCreateIn) -> None:
        if payload.trigger_kind not in {definition.kind for definition in list_global_automation_triggers()}:
            raise BadRequest(
                "Global automation only supports workspace-level triggers.",
                error="AUTOMATION_GLOBAL_TRIGGER_SCOPE_INVALID",
            )
        ProjectAutomationService._validate_global_operations(payload.operations)
        if ProjectAutomationService._project_id_from_credential_binding(payload.credential_binding) is not None:
            raise BadRequest(
                "Global automation cannot bind a project context.",
                error="AUTOMATION_GLOBAL_BINDING_SCOPE_INVALID",
            )

    @staticmethod
    def _validate_project_scope_payload(payload: AutomationFlowCreateIn) -> None:
        if payload.trigger_kind not in {definition.kind for definition in list_project_automation_triggers()}:
            raise BadRequest(
                "Project automation requires a project-scoped trigger.",
                error="AUTOMATION_PROJECT_TRIGGER_SCOPE_INVALID",
            )

    @staticmethod
    def _validate_global_scope_patch(payload: AutomationFlowPatchIn) -> None:
        if payload.operations is not None:
            ProjectAutomationService._validate_global_operations(payload.operations)
        if (
            payload.credential_binding is not None
            and ProjectAutomationService._project_id_from_credential_binding(payload.credential_binding) is not None
        ):
            raise BadRequest(
                "Global automation cannot bind a project context.",
                error="AUTOMATION_GLOBAL_BINDING_SCOPE_INVALID",
            )

    @staticmethod
    def _validate_project_scope_patch(payload: AutomationFlowPatchIn) -> None:
        if payload.operations is not None:
            ProjectAutomationService._validate_project_operations(payload.operations)

    @staticmethod
    def _validate_global_operations(operations: list[Any]) -> None:
        allowed_kinds = {definition.kind for definition in list_global_automation_operation_kinds()}
        for operation in operations:
            kind = AutomationOperationKind(str(operation.kind))
            if kind not in allowed_kinds:
                raise BadRequest(
                    "Global automation only supports integration-level operations.",
                    error="AUTOMATION_GLOBAL_OPERATION_SCOPE_INVALID",
                    meta={"operationKind": kind.value},
                )

    @staticmethod
    def _validate_project_operations(operations: list[Any]) -> None:
        allowed_kinds = {definition.kind for definition in list_project_automation_operation_kinds()}
        for operation in operations:
            kind = AutomationOperationKind(str(operation.kind))
            if kind not in allowed_kinds:
                raise BadRequest(
                    "Project automation operation is unsupported.",
                    error="AUTOMATION_PROJECT_OPERATION_SCOPE_INVALID",
                    meta={"operationKind": kind.value},
                )

    async def _get_flow_or_raise(self, *, workspace_id: UUID, flow_id: UUID) -> AutomationFlow:
        flow = await self.repo.get_flow(workspace_id=workspace_id, flow_id=flow_id)
        if flow is None:
            raise NotFound(message=t("errors", "NOT_FOUND"), error="AUTOMATION_FLOW_NOT_FOUND")
        return flow

    async def _get_project_flow_or_raise(
        self,
        *,
        workspace_id: UUID,
        project_id: UUID,
        flow_id: UUID,
    ) -> AutomationFlow:
        flow = await self.repo.get_project_flow(
            workspace_id=workspace_id,
            project_id=project_id,
            flow_id=flow_id,
        )
        if flow is None:
            raise NotFound(message=t("errors", "NOT_FOUND"), error="AUTOMATION_FLOW_NOT_FOUND")
        return flow

    async def _execute_operation(
        self,
        *,
        run: AutomationRun,
        operation: AutomationOperation,
        event: Event,
    ) -> dict[str, Any]:
        config = operation.config if isinstance(operation.config, dict) else {}
        kind = AutomationOperationKind(str(operation.kind))
        if kind in {AutomationOperationKind.WEBHOOK, AutomationOperationKind.HTTP_REQUEST}:
            result = await self._execute_http_operation(config=config, event=event)
        elif kind == AutomationOperationKind.AGENT_ANALYSIS:
            result = await self._execute_agent_analysis(config=config, event=event, workspace_id=run.workspace_id)
        elif kind == AutomationOperationKind.CONTENT_READ:
            result = await self._execute_content_read(config=config, event=event, workspace_id=run.workspace_id)
        elif kind == AutomationOperationKind.CONTENT_UPDATE:
            result = await self._execute_content_update(config=config, event=event, workspace_id=run.workspace_id)
        elif kind == AutomationOperationKind.RELEASE_PUBLISH:
            result = await self._execute_release_publish(config=config, event=event, workspace_id=run.workspace_id)
        elif kind == AutomationOperationKind.NOTIFICATION:
            result = await self._execute_notification(config=config, event=event, workspace_id=run.workspace_id)
        else:
            raise BadRequest("Unsupported automation operation.", error="AUTOMATION_OPERATION_UNSUPPORTED")
        await self.repo.create_log(
            workspace_id=run.workspace_id,
            run_id=run.id,
            operation_id=operation.id,
            level=AutomationRunLogLevel.INFO,
            message=f"Operation {kind.value} completed.",
            payload=result,
        )
        return {"operationId": str(operation.id), "kind": kind.value, "result": result}

    async def _execute_http_operation(self, *, config: dict[str, Any], event: Event) -> dict[str, Any]:
        url = str(config.get("url") or "")
        method = str(config.get("method") or "POST").upper()
        headers = {str(k): str(v) for k, v in (config.get("headers") or {}).items()}
        body = {"event": event.name, "payload": event.payload}
        async with httpx.AsyncClient(timeout=DEFAULT_HTTP_TIMEOUT_S) as client:
            response = await client.request(method, url, json=body, headers=headers)
        if response.status_code < 200 or response.status_code >= 300:
            raise RuntimeError(f"HTTP_{response.status_code}")
        return {"statusCode": response.status_code}

    async def _execute_agent_analysis(
        self,
        *,
        config: dict[str, Any],
        event: Event,
        workspace_id: UUID,
    ) -> dict[str, Any]:
        payload = event.payload if isinstance(event.payload, dict) else {}
        tenant_context = require_tenant_context_from_payload(payload)
        item_id = self._uuid_from_config_or_event(config, event, "itemId", "entity_id")
        site_id = self._uuid_or_none(payload.get("site_id")) or tenant_context.identity.site_id
        project_id = self._uuid_or_none(payload.get("project_id")) or tenant_context.identity.project_id
        runtime_id = self._uuid_or_none(payload.get("runtime_id")) or tenant_context.identity.runtime_id
        environment_id = self._uuid_or_none(payload.get("environment_id"))
        actor_user_id = self._uuid_or_none(event.actor_user_id)
        if item_id is None or site_id is None or project_id is None or actor_user_id is None:
            raise BadRequest(
                "Agent analysis requires itemId, siteId, projectId, and actor user.",
                error="AUTOMATION_AGENT_ANALYSIS_INVALID",
            )

        agent_id = "content_analyzer"
        prompt = str(config.get("prompt") or DEFAULT_AGENT_ANALYSIS_PROMPT).strip() or DEFAULT_AGENT_ANALYSIS_PROMPT
        state = await self._build_agent_engine(tenant_context).run(
            context=AgentRunContext(
                workspace_id=workspace_id,
                project_id=project_id,
                user_id=actor_user_id,
                correlation_id=event.trace_id or str(config.get("correlationId") or uuid4().hex),
                runtime_id=runtime_id,
                site_id=site_id,
                environment_id=environment_id,
            ),
            agent_id=agent_id,
            prompt=prompt,
            model=str(config.get("model")) if config.get("model") else None,
            tool_inputs={
                "get_content": {"itemId": str(item_id)},
                "analyze_content": {"itemId": str(item_id)},
            },
        )
        status = AgentRunStatus(str(state.status))
        if status != AgentRunStatus.COMPLETED:
            raise RuntimeError(state.error_code or f"AGENT_RUN_{status.value.upper()}")
        return {
            "agentRunId": str(state.id),
            "agentId": state.agent_id,
            "status": status.value,
            "itemId": str(item_id),
            "toolOutputs": state.tool_outputs,
            "result": state.result,
        }

    def _build_agent_engine(self, tenant_context: TenantContext) -> AgentRunEngine:
        item_reads = self.content_read_service_factory(tenant_context)
        model_reads = self.content_model_read_service_factory(tenant_context, self.settings)
        registry = build_default_agent_registry(
            tools=build_read_only_content_tools(item_reads=item_reads, model_reads=model_reads),
        )
        return AgentRunEngine(
            registry=registry,
            sessions=self.agent_sessions,
            chat_service=self.agent_chat_service_factory(self.settings),
        )

    async def _execute_content_read(
        self, *, config: dict[str, Any], event: Event, workspace_id: UUID
    ) -> dict[str, Any]:
        tenant_context = require_tenant_context_from_payload(event.payload if isinstance(event.payload, dict) else None)
        item_id = self._uuid_from_config_or_event(config, event, "itemId", "entity_id")
        site_id = self._uuid_from_config_or_event(config, event, "siteId", "site_id")
        if item_id is None or site_id is None:
            raise BadRequest("Content read requires itemId and siteId.", error="AUTOMATION_CONTENT_READ_INVALID")
        service = self.content_read_service_factory(tenant_context)
        item = await service.get_item(workspace_id=workspace_id, site_id=site_id, item_id=item_id)
        return {"itemId": str(item.id), "title": item.title, "workflowStage": item.workflow_stage}

    async def _execute_content_update(
        self,
        *,
        config: dict[str, Any],
        event: Event,
        workspace_id: UUID,
    ) -> dict[str, Any]:
        tenant_context = require_tenant_context_from_payload(event.payload if isinstance(event.payload, dict) else None)
        item_id = self._uuid_from_config_or_event(config, event, "itemId", "entity_id")
        site_id = self._uuid_from_config_or_event(config, event, "siteId", "site_id")
        stage = config.get("stage")
        if item_id is None or site_id is None or not stage:
            raise BadRequest(
                "Content update requires itemId, siteId, and stage.", error="AUTOMATION_CONTENT_UPDATE_INVALID"
            )
        if self.lifecycle_dispatcher is None:
            raise ServiceUnavailable(
                t("settings", "AUTOMATION_LIFECYCLE_DISPATCHER_UNAVAILABLE"),
                error="AUTOMATION_LIFECYCLE_DISPATCHER_UNAVAILABLE",
            )
        service = self.content_items_service_factory(tenant_context, self.lifecycle_dispatcher)
        item = await service.patch_workflow(
            project_id=self._project_id_from_event_payload(event.payload),
            workspace_id=workspace_id,
            site_id=site_id,
            item_id=item_id,
            actor_user_id=self._uuid_or_none(event.actor_user_id),
            payload=ContentItemWorkflowPatchIn(stage=stage, summary=config.get("summary")),
        )
        return {"itemId": str(item.id), "workflowStage": item.workflow_stage}

    async def _execute_release_publish(
        self,
        *,
        config: dict[str, Any],
        event: Event,
        workspace_id: UUID,
    ) -> dict[str, Any]:
        tenant_context = require_tenant_context_from_payload(event.payload if isinstance(event.payload, dict) else None)
        site_id = self._uuid_from_config_or_event(config, event, "siteId", "site_id")
        actor_user_id = self._uuid_or_none(event.actor_user_id)
        if site_id is None or actor_user_id is None:
            raise BadRequest(
                "Release publish requires siteId and actor user.", error="AUTOMATION_RELEASE_PUBLISH_INVALID"
            )
        service = self.release_service_factory(tenant_context)
        out = await service.publish_release_out(workspace_id=workspace_id, site_id=site_id, actor_user_id=actor_user_id)
        return {"releaseId": str(out.release.id), "releaseNumber": out.release.release_number}

    async def _execute_notification(
        self,
        *,
        config: dict[str, Any],
        event: Event,
        workspace_id: UUID,
    ) -> dict[str, Any]:
        recipient_user_id = self._uuid_or_none(config.get("recipientUserId"))
        title = str(config.get("title") or "").strip()
        if recipient_user_id is None or not title:
            raise BadRequest(
                "Notification requires recipientUserId and title.", error="AUTOMATION_NOTIFICATION_INVALID"
            )
        try:
            target = validate_notification_navigation_target(config.get("target"))
        except ValueError as exc:
            raise BadRequest(
                "Notification requires a valid typed target.",
                error="AUTOMATION_NOTIFICATION_TARGET_INVALID",
            ) from exc
        result = await create_notification_record(
            settings=self.settings,
            workspace_id=workspace_id,
            recipient_user_id=recipient_user_id,
            category=NotificationCategory.TASK,
            title=title,
            body=str(config.get("body") or f"Automation ran for {event.name}"),
            target=target,
            actor_user_id=self._uuid_or_none(event.actor_user_id),
            event_name="automation.notification",
            dedupe_key=None,
        )
        if result.disposition != NotificationRecordCreateDisposition.CREATED or result.record is None:
            return {"notificationId": None, "delivered": False}
        return {"notificationId": str(result.record.id), "delivered": True}

    @staticmethod
    def _workspace_id_from_payload(payload: dict[str, Any]) -> UUID | None:
        return ProjectAutomationService._uuid_or_none(payload.get("workspace_id"))

    @staticmethod
    def _uuid_from_config_or_event(
        config: dict[str, Any], event: Event, config_key: str, event_key: str
    ) -> UUID | None:
        return ProjectAutomationService._uuid_or_none(config.get(config_key) or event.payload.get(event_key))

    @staticmethod
    def _uuid_or_none(raw: Any) -> UUID | None:
        if raw is None:
            return None
        try:
            return UUID(str(raw))
        except (TypeError, ValueError):
            return None

    async def _to_flow_out(self, flow: AutomationFlow) -> AutomationFlowOut:
        operations = await self.repo.list_operations(flow_id=flow.id)
        return AutomationFlowOut(
            id=flow.id,
            workspace_id=flow.workspace_id,
            project_id=self._project_id_from_credential_binding(flow.credential_binding),
            name=flow.name,
            description=flow.description,
            status=AutomationFlowStatus(str(flow.status)),
            trigger_kind=flow.trigger_kind,
            trigger_event=flow.trigger_event,
            retry_limit=flow.retry_limit,
            dead_letter_enabled=flow.dead_letter_enabled,
            credential_binding=flow.credential_binding if isinstance(flow.credential_binding, dict) else None,
            created_by_user_id=flow.created_by_user_id,
            updated_by_user_id=flow.updated_by_user_id,
            operations=[self._to_operation_out(operation) for operation in operations],
            created_at=flow.created_at,
            updated_at=flow.updated_at,
        )

    @staticmethod
    def _to_operation_out(operation: AutomationOperation) -> AutomationOperationOut:
        return AutomationOperationOut(
            id=operation.id,
            flow_id=operation.flow_id,
            name=operation.name,
            kind=AutomationOperationKind(str(operation.kind)),
            config=operation.config if isinstance(operation.config, dict) else None,
            sort_order=operation.sort_order,
            created_at=operation.created_at,
            updated_at=operation.updated_at,
        )

    async def _to_run_out(self, run: AutomationRun, *, include_logs: bool) -> AutomationRunOut:
        logs = await self.repo.list_run_logs(workspace_id=run.workspace_id, run_id=run.id) if include_logs else []
        return AutomationRunOut(
            id=run.id,
            workspace_id=run.workspace_id,
            project_id=self._project_id_from_event_payload(run.event_payload),
            flow_id=run.flow_id,
            trigger_event=run.trigger_event,
            status=AutomationRunStatus(str(run.status)),
            attempt=run.attempt,
            max_attempts=run.max_attempts,
            event_payload=run.event_payload if isinstance(run.event_payload, dict) else None,
            result_payload=run.result_payload if isinstance(run.result_payload, dict) else None,
            error=run.error,
            started_at=run.started_at,
            completed_at=run.completed_at,
            created_at=run.created_at,
            updated_at=run.updated_at,
            logs=[
                AutomationRunLogOut(
                    id=log.id,
                    run_id=log.run_id,
                    operation_id=log.operation_id,
                    level=AutomationRunLogLevel(str(log.level)),
                    message=log.message,
                    payload=log.payload if isinstance(log.payload, dict) else None,
                    created_at=log.created_at,
                )
                for log in logs
            ],
        )

    @staticmethod
    def _project_id_from_credential_binding(binding: Any) -> UUID | None:
        if not isinstance(binding, dict):
            return None
        return ProjectAutomationService._uuid_or_none(binding.get("projectId"))

    @staticmethod
    def _project_id_from_event_payload(payload: Any) -> UUID | None:
        if not isinstance(payload, dict):
            return None
        return ProjectAutomationService._uuid_or_none(payload.get("project_id") or payload.get("projectId"))
