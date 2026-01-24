from __future__ import annotations

from fastapi import APIRouter

from apps.api.routers.v1.admin.rbac_org.router import router

__all__ = ["router", "APIRouter"]
