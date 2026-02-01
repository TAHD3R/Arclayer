from __future__ import annotations

from fastapi import APIRouter

from apps.api.routers.v1.workspaces.rbac.router import router

__all__ = ["router", "APIRouter"]
