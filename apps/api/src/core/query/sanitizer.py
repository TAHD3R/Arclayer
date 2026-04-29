from __future__ import annotations

from src.core.query.parser import QueryPlan


class QuerySanitizer:
    """Validates and sanitizes query parameters."""

    DEFAULT_MAX_DEPTH = 10
    DEFAULT_MAX_PAGE_SIZE = 100

    @staticmethod
    def sanitize(plan: QueryPlan, *, max_depth: int | None = None, max_page_size: int | None = None) -> QueryPlan:
        depth = max_depth if max_depth is not None else QuerySanitizer.DEFAULT_MAX_DEPTH
        size_limit = max_page_size if max_page_size is not None else QuerySanitizer.DEFAULT_MAX_PAGE_SIZE

        return QueryPlan(
            filters=plan.filters,
            sorts=plan.sorts,
            page=max(1, plan.page),
            page_size=max(1, min(plan.page_size, size_limit)),
            populate=[p for p in plan.populate if ".." not in p and "/" not in p][:depth],
            fields=plan.fields,
            max_depth=min(plan.max_depth, depth),
        )

    @staticmethod
    def validate(plan: QueryPlan) -> list[str]:
        errors: list[str] = []
        if plan.max_depth > QuerySanitizer.DEFAULT_MAX_DEPTH:
            errors.append(f"max_depth exceeds maximum of {QuerySanitizer.DEFAULT_MAX_DEPTH}")
        if plan.page_size > QuerySanitizer.DEFAULT_MAX_PAGE_SIZE:
            errors.append(f"page_size exceeds maximum of {QuerySanitizer.DEFAULT_MAX_PAGE_SIZE}")
        return errors
