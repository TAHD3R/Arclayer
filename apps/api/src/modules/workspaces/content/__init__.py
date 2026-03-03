from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from apps.api.src.modules.workspaces.content.router import router as router

__all__ = ["router"]


def __getattr__(name: str) -> Any:
    # Lazy import to avoid circular imports during ORM/model import.
    if name == "router":
        from apps.api.src.modules.workspaces.content.router import router

        return router
    raise AttributeError(name)
