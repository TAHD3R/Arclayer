from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Literal, cast
from uuid import UUID

from fastapi import Request
from strawberry.fastapi import BaseContext

from src.config import Settings
from src.core.exceptions import APIError, Forbidden, ServiceUnavailable
from src.core.logging import get_logger
from src.models.content.route_binding import RouteBindingRecord
from src.models.workspaces.api_key import ApiKeyFamily, ApiKeyRecord, DeliveryKeyPerspective
from src.modules.sites.content.service import SiteContentService
from src.modules.sites.delivery.schema import (
    DeliveryGlobalSetOut,
    DeliveryPageOut,
    DeliveryPerspective,
    DeliverySectionOut,
)
from src.modules.sites.publishing.content_snapshot import CanonicalContentSnapshot, build_canonical_content_snapshot
from src.modules.sites.repository import SitesRepository
from src.modules.sites.service import SiteService
from src.modules.workspaces.api_keys.repository import WorkspaceApiKeysRepository
from src.modules.workspaces.api_keys.scopes import build_api_key_access_profile
from src.modules.workspaces.api_keys.security import split_api_key_token, verify_api_key_token
from src.modules.workspaces.content.models.protocol_registry import get_official_model_protocol
from src.modules.workspaces.content.runtime import (
    DocumentFacade,
    DocumentQuery,
    DocumentQueryRecord,
    DocumentRuntimeMetadata,
)
from src.platform.cache.valkey import ValkeyClientLike
from src.settings.crypto import ensure_master_key, master_key_exists

GraphQLPerspective = Literal["published", "preview"]
logger = get_logger(__name__)

_ARTICLE_FIELD_ALIASES: dict[str, tuple[str, ...]] = {
    "content": ("content", "body"),
}


@dataclass(frozen=True, slots=True)
class StructuredContentRecord:
    item_id: UUID
    model_key: str
    locale: str
    title: str | None
    slug: str | None
    revision: int
    revision_state: Literal["draft", "published"]
    draft_revision: int
    published_revision: int | None
    fields: dict[str, Any]
    custom_fields: dict[str, Any]
    route_path: str | None = None
    route_contract: dict[str, Any] | None = None


@dataclass(frozen=True, slots=True)
class AuthenticatedDeliveryKey:
    record: ApiKeyRecord
    graphql_read: bool


GraphQLSortDirection = Literal["asc", "desc"]


def _normalize_json_value(value: Any) -> Any:
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, dict):
        return {str(key): _normalize_json_value(nested) for key, nested in value.items()}
    if isinstance(value, list):
        return [_normalize_json_value(item) for item in value]
    if isinstance(value, datetime):
        return value.astimezone(UTC).isoformat()
    return str(value)


def _field_aliases(model_key: str, field_key: str) -> tuple[str, ...]:
    if model_key == "article":
        return _ARTICLE_FIELD_ALIASES.get(field_key, (field_key,))
    return (field_key,)


def _extract_system_field(*, model_key: str, fields: dict[str, Any], field_key: str) -> Any:
    for candidate in _field_aliases(model_key, field_key):
        if candidate in fields:
            return _normalize_json_value(fields.get(candidate))
    return None


def _build_custom_fields(*, model_key: str, fields: dict[str, Any]) -> dict[str, Any]:
    protocol = get_official_model_protocol(model_key)
    if protocol is None:
        return {str(key): _normalize_json_value(value) for key, value in fields.items()}

    system_keys = {alias for field in protocol.system_fields for alias in _field_aliases(model_key, field.key)}
    return {str(key): _normalize_json_value(value) for key, value in fields.items() if str(key) not in system_keys}


def _normalized_string(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        normalized = value.strip()
        return normalized or None
    return str(value).strip() or None


def _normalized_contains(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip().lower()
    return normalized or None


def _record_text_field(record: StructuredContentRecord, field_key: str) -> str | None:
    if field_key == "title":
        return _normalized_string(record.title)
    if field_key == "slug":
        return _normalized_string(record.slug)
    if field_key == "revision_state":
        return _normalized_string(record.revision_state)
    if field_key == "path":
        return _normalized_string(record.route_path or record.fields.get("path"))
    if field_key == "section_key":
        return _normalized_string(record.fields.get("section_key"))
    if field_key == "name":
        return _normalized_string(record.fields.get("name"))
    return _normalized_string(record.fields.get(field_key))


def _record_sort_value(record: StructuredContentRecord, field_key: str) -> tuple[int, Any, str]:
    if field_key == "revision":
        return (0, int(record.revision), str(record.item_id))
    value = _record_text_field(record, field_key)
    if value is None:
        return (1, "", str(record.item_id))
    return (0, value.lower(), str(record.item_id))


def _record_matches_all(
    record: StructuredContentRecord,
    *,
    exact_filters: dict[str, str],
    contains_filters: dict[str, str],
) -> bool:
    for field_key, expected in exact_filters.items():
        value = _record_text_field(record, field_key)
        if value is None or value.lower() != expected.lower():
            return False
    for field_key, expected in contains_filters.items():
        value = _record_text_field(record, field_key)
        if value is None or expected not in value.lower():
            return False
    return True


class SiteGraphQLService:
    def __init__(self, settings: Settings, *, valkey: ValkeyClientLike | None = None) -> None:
        self._settings = settings
        self._repo = SitesRepository()
        self._content_service = SiteContentService(settings, repo=self._repo)
        self._site_service = SiteService(settings, valkey=valkey, repo=self._repo)
        self._api_keys_repo = WorkspaceApiKeysRepository()
        self._document_facade = DocumentFacade.for_items_repo(self._repo)

    async def resolve_query_access(
        self,
        *,
        site_id: UUID,
        request: Request,
        perspective: GraphQLPerspective,
        preview_token: str | None,
    ) -> None:
        api_key = await self._authenticate_delivery_key(request=request, site_id=site_id)
        if perspective == "published":
            if api_key is None:
                self._log_query_access(request=request, site_id=site_id, perspective=perspective, api_key=None)
                return
            if not api_key.graphql_read:
                raise Forbidden("GraphQL scope required", error="GRAPHQL_SCOPE_REQUIRED")
            if api_key.record.delivery_perspective != DeliveryKeyPerspective.PUBLISHED:
                raise Forbidden("Delivery key perspective forbidden", error="DELIVERY_KEY_PERSPECTIVE_FORBIDDEN")
            self._log_query_access(request=request, site_id=site_id, perspective=perspective, api_key=api_key)
            return

        if api_key is not None:
            if not api_key.graphql_read:
                raise Forbidden("GraphQL scope required", error="GRAPHQL_SCOPE_REQUIRED")
            if api_key.record.delivery_perspective != DeliveryKeyPerspective.PREVIEW:
                raise Forbidden("Delivery key perspective forbidden", error="DELIVERY_KEY_PERSPECTIVE_FORBIDDEN")
            self._log_query_access(request=request, site_id=site_id, perspective=perspective, api_key=api_key)
            return
        await self._site_service.assert_preview_access_async(site_id=site_id, mode="preview", token=preview_token)
        self._log_query_access(
            request=request, site_id=site_id, perspective=perspective, api_key=None, preview_token=preview_token
        )

    @staticmethod
    def _log_query_access(
        *,
        request: Request,
        site_id: UUID,
        perspective: GraphQLPerspective,
        api_key: AuthenticatedDeliveryKey | None,
        preview_token: str | None = None,
    ) -> None:
        if getattr(request.state, "graphql_access_logged", False):
            return
        request.state.graphql_access_logged = True
        logger.info(
            "GraphQL query access granted",
            access_mode="api_key" if api_key is not None else ("preview_token" if preview_token else "public"),
            delivery_key_id=str(api_key.record.id) if api_key is not None else None,
            delivery_key_perspective=(
                str(api_key.record.delivery_perspective)
                if api_key is not None and api_key.record.delivery_perspective is not None
                else None
            ),
            graphql_read=api_key.graphql_read if api_key is not None else None,
            perspective=perspective,
            site_id=str(site_id),
        )

    async def delivery_resolve_page(
        self,
        *,
        site_id: UUID,
        path: str,
        perspective: DeliveryPerspective,
    ) -> DeliveryPageOut | None:
        return await self._content_service.delivery_resolve_page(site_id=site_id, path=path, perspective=perspective)

    async def delivery_get_page_by_id(
        self,
        *,
        site_id: UUID,
        page_id: UUID,
        perspective: DeliveryPerspective,
    ) -> DeliveryPageOut | None:
        return await self._content_service.delivery_get_page_by_id(
            site_id=site_id,
            page_id=page_id,
            perspective=perspective,
        )

    async def delivery_get_section_by_alias(
        self,
        *,
        site_id: UUID,
        alias: str,
        perspective: DeliveryPerspective,
    ) -> DeliverySectionOut:
        return await self._content_service.delivery_get_section_by_alias(
            site_id=site_id,
            alias=alias,
            perspective=perspective,
        )

    async def delivery_get_global_set(
        self,
        *,
        site_id: UUID,
        key: str,
        perspective: DeliveryPerspective,
    ) -> DeliveryGlobalSetOut:
        return await self._content_service.delivery_get_global_set(site_id=site_id, key=key, perspective=perspective)

    async def list_records(
        self,
        *,
        site_id: UUID,
        model_key: str,
        perspective: GraphQLPerspective,
        exact_filters: dict[str, str] | None = None,
        contains_filters: dict[str, str] | None = None,
        sort_field: str | None = None,
        sort_direction: GraphQLSortDirection = "asc",
        limit: int | None = None,
        offset: int = 0,
    ) -> list[StructuredContentRecord]:
        query_records = (
            await self._list_published_records(site_id=site_id, model_key=model_key)
            if perspective == "published"
            else await self._list_preview_records(site_id=site_id, model_key=model_key)
        )

        boundary = self._document_facade.build_query_boundary(query_records)
        result = boundary.execute(
            DocumentQuery(
                site_id=site_id,
                model_key=model_key,
                perspective=perspective,
            )
        )

        structured_records = [self._to_structured_record(record) for record in result.records]
        filtered = [
            record
            for record in structured_records
            if _record_matches_all(
                record,
                exact_filters=exact_filters or {},
                contains_filters=contains_filters or {},
            )
        ]

        if sort_field:
            filtered = sorted(
                filtered,
                key=lambda record: _record_sort_value(record, sort_field),
                reverse=sort_direction == "desc",
            )

        bounded_offset = max(offset, 0)
        if limit is None:
            return filtered[bounded_offset:]
        bounded_limit = max(limit, 0)
        return filtered[bounded_offset : bounded_offset + bounded_limit]

    async def get_record_by_slug(
        self,
        *,
        site_id: UUID,
        model_key: str,
        slug: str,
        perspective: GraphQLPerspective,
    ) -> StructuredContentRecord | None:
        normalized = slug.strip()
        if not normalized:
            return None
        records = await self.list_records(site_id=site_id, model_key=model_key, perspective=perspective)
        for record in records:
            if record.slug == normalized:
                return record
        return None

    async def get_page_record_by_path(
        self,
        *,
        site_id: UUID,
        path: str,
        perspective: GraphQLPerspective,
    ) -> StructuredContentRecord | None:
        normalized = path.strip()
        if not normalized:
            return None
        records = await self.list_records(site_id=site_id, model_key="page", perspective=perspective)
        for record in records:
            record_path = record.route_path or str(record.fields.get("path") or "")
            if record_path == normalized:
                return record
        return None

    async def get_reusable_section_record_by_alias(
        self,
        *,
        site_id: UUID,
        alias: str,
        perspective: GraphQLPerspective,
    ) -> StructuredContentRecord | None:
        normalized = alias.strip()
        if not normalized:
            return None
        records = await self.list_records(site_id=site_id, model_key="reusable-section", perspective=perspective)
        for record in records:
            if (
                _extract_system_field(
                    model_key="reusable-section",
                    fields=record.fields,
                    field_key="section_key",
                )
                == normalized
            ):
                return record
        return None

    async def _list_preview_records(self, *, site_id: UUID, model_key: str) -> list[DocumentQueryRecord]:
        items = await self._repo.list_content_entries_by_model_key(site_id=site_id, model_key=model_key)
        route_bindings: dict[UUID, RouteBindingRecord] = (
            {
                binding.item_id: binding
                for binding in await self._repo.list_content_route_bindings(site_id=site_id)
            }
            if model_key == "page"
            else {}
        )
        records: list[DocumentQueryRecord] = []
        for item in items:
            snapshot_meta = await self._load_preview_snapshot(item)
            if snapshot_meta is None:
                continue
            revision, revision_state, snapshot = snapshot_meta
            binding = route_bindings.get(item.id)
            route_contract = binding.route_contract if binding and isinstance(binding.route_contract, dict) else None
            route_path = binding.path if binding is not None else None
            records.append(
                self._build_query_record(
                    item=item,
                    revision=revision,
                    revision_state=revision_state,
                    snapshot=snapshot,
                    metadata=DocumentRuntimeMetadata(
                        route_path=route_path,
                        route_contract=route_contract,
                        binding_key=None,
                        protocol_key=(
                            str(item.model_definition.protocol_key)
                            if item.model_definition is not None and item.model_definition.protocol_key is not None
                            else None
                        ),
                    ),
                )
            )
        return sorted(
            records,
            key=lambda record: (
                record.revision_state != "draft",
                record.revision,
                record.item.id.hex,
            ),
        )

    async def _list_published_records(self, *, site_id: UUID, model_key: str) -> list[DocumentQueryRecord]:
        graph_nodes = await self._repo.list_active_release_nodes_by_model_key(site_id=site_id, model_key=model_key)
        records: list[DocumentQueryRecord] = []
        for graph_node in graph_nodes:
            snapshot = await self._build_snapshot(item=graph_node.item, version=graph_node.version)
            records.append(
                self._build_query_record(
                    item=graph_node.item,
                    revision=int(graph_node.version.version),
                    revision_state="published",
                    snapshot=snapshot,
                    metadata=DocumentRuntimeMetadata(
                        route_path=graph_node.route_path,
                        route_contract=(
                            graph_node.route_contract if isinstance(graph_node.route_contract, dict) else None
                        ),
                        protocol_key=(
                            str(graph_node.item.model_definition.protocol_key)
                            if graph_node.item.model_definition is not None
                            and graph_node.item.model_definition.protocol_key is not None
                            else None
                        ),
                    ),
                )
            )
        return sorted(records, key=lambda record: (record.revision, record.item.id.hex), reverse=True)

    async def _load_preview_snapshot(
        self,
        item,
    ) -> tuple[int, Literal["draft", "published"], CanonicalContentSnapshot] | None:
        draft_revision = int(item.draft_version or 0)
        published_revision = int(item.published_version or 0)
        revision = draft_revision or published_revision
        if revision < 1:
            return None
        state: Literal["draft", "published"] = "draft" if draft_revision else "published"
        version = await self._repo.get_content_revision_by_number(entry_id=UUID(str(item.id)), revision=revision)
        if version is None:
            return None
        snapshot = await self._build_snapshot(item=item, version=version)
        return revision, state, snapshot

    async def _build_snapshot(self, *, item, version) -> CanonicalContentSnapshot:
        presentations = await self._repo.list_content_presentations(version_id=version.id)
        seo_profile = await self._repo.get_content_seo_profile(version_id=version.id)
        return build_canonical_content_snapshot(
            item=item,
            version=version,
            presentations=presentations,
            seo_profile=seo_profile,
        )

    def _build_query_record(
        self,
        *,
        item,
        revision: int,
        revision_state: Literal["draft", "published"],
        snapshot: CanonicalContentSnapshot,
        metadata: DocumentRuntimeMetadata,
    ) -> DocumentQueryRecord:
        fields = snapshot.fields if isinstance(snapshot.fields, dict) else {}
        return DocumentQueryRecord(
            item=item,
            revision=revision,
            revision_state=revision_state,
            fields={str(key): _normalize_json_value(value) for key, value in fields.items()},
            metadata=metadata,
        )

    def _to_structured_record(self, record: DocumentQueryRecord) -> StructuredContentRecord:
        item = record.item
        model_key = str(item.model_definition.key if item.model_definition is not None else "")
        title = _extract_system_field(model_key=model_key, fields=record.fields, field_key="title")
        slug = _extract_system_field(model_key=model_key, fields=record.fields, field_key="slug")
        return StructuredContentRecord(
            item_id=UUID(str(item.id)),
            model_key=model_key,
            locale=str(item.locale or ""),
            title=title if isinstance(title, str) else item.title,
            slug=slug if isinstance(slug, str) else item.slug,
            revision=record.revision,
            revision_state=cast(Literal["draft", "published"], record.revision_state),
            draft_revision=int(item.draft_version or 0),
            published_revision=int(item.published_version or 0) or None,
            fields=record.fields,
            custom_fields=_build_custom_fields(model_key=model_key, fields=record.fields),
            route_path=record.metadata.route_path,
            route_contract=record.metadata.route_contract,
        )

    async def _authenticate_delivery_key(
        self,
        *,
        request: Request,
        site_id: UUID,
    ) -> AuthenticatedDeliveryKey | None:
        if getattr(request.state, "graphql_delivery_key_checked", False):
            return getattr(request.state, "graphql_delivery_key", None)
        token = self._extract_api_key_token(request)
        if token is None:
            request.state.graphql_delivery_key_checked = True
            request.state.graphql_delivery_key = None
            return None

        try:
            family, public_id, _secret = split_api_key_token(token)
        except ValueError as exc:
            raise Forbidden("Invalid API key token", error="API_KEY_INVALID") from exc
        if family != ApiKeyFamily.DELIVERY:
            raise Forbidden("Delivery API key required", error="API_KEY_FAMILY_FORBIDDEN")

        record = await self._api_keys_repo.get_key_by_public_id(token_public_id=public_id)
        if record is None:
            raise Forbidden("API key not found", error="API_KEY_NOT_FOUND")
        if UUID(str(record.site_id)) != site_id:
            raise Forbidden("API key site mismatch", error="API_KEY_SITE_MISMATCH")
        if record.revoked_at is not None:
            raise Forbidden("API key revoked", error="API_KEY_REVOKED")
        if record.expires_at is not None and record.expires_at <= datetime.now(tz=UTC):
            raise Forbidden("API key expired", error="API_KEY_EXPIRED")

        pepper = self._load_api_key_pepper()
        if not verify_api_key_token(token=token, pepper=pepper, expected_hash=record.token_hash):
            raise Forbidden("API key invalid", error="API_KEY_INVALID")

        await self._api_keys_repo.update_key(record, fields={"last_used_at": datetime.now(tz=UTC)})
        profile = build_api_key_access_profile(record.scopes if isinstance(record.scopes, list) else [])
        authenticated = AuthenticatedDeliveryKey(record=record, graphql_read=profile.graphql_read)
        request.state.graphql_delivery_key_checked = True
        request.state.graphql_delivery_key = authenticated
        return authenticated

    @staticmethod
    def _extract_api_key_token(request: Request) -> str | None:
        explicit = request.headers.get("x-api-key")
        authorization = request.headers.get("authorization")
        bearer = None
        if isinstance(authorization, str) and authorization.lower().startswith("bearer "):
            bearer = authorization[7:].strip()
        tokens = [value.strip() for value in [explicit, bearer] if isinstance(value, str) and value.strip()]
        if not tokens:
            return None
        if len(tokens) == 2 and tokens[0] != tokens[1]:
            raise Forbidden("Conflicting API key headers", error="API_KEY_CONFLICT")
        return tokens[0]

    def _load_api_key_pepper(self) -> bytes:
        key_path = self._settings.security.master_key_path
        if not master_key_exists(key_path):
            raise ServiceUnavailable("Master key missing", error="MASTER_KEY_MISSING")
        try:
            key, _fingerprint = ensure_master_key(key_path)
            return key
        except ValueError as exc:
            raise ServiceUnavailable("Master key invalid", error="MASTER_KEY_INVALID") from exc
        except OSError as exc:
            raise ServiceUnavailable("API key hashing unavailable", error="API_KEY_HASHING_UNAVAILABLE") from exc


class SiteGraphQLContext(BaseContext):
    site_id: UUID
    request: Request
    graphql: SiteGraphQLService

    def __init__(
        self,
        *,
        site_id: UUID,
        request: Request,
        settings: Settings,
        valkey: ValkeyClientLike | None = None,
    ) -> None:
        self.site_id = site_id
        self.request = request
        self.graphql = SiteGraphQLService(settings, valkey=valkey)


def graphql_error_extensions(exc: APIError) -> dict[str, Any]:
    return {
        "code": exc.error or "API_ERROR",
        "statusCode": exc.status_code,
        "details": _normalize_json_value(exc.details),
        "meta": _normalize_json_value(exc.meta),
    }
