from __future__ import annotations

from fastapi import FastAPI
from fastapi.routing import APIRoute


def ensure_unique_route_names(app: FastAPI) -> None:
    """检查路由名称是否唯一。"""
    temp_routes = set()
    for route in app.routes:
        if isinstance(route, APIRoute):
            if route.name in temp_routes:
                raise ValueError(f"Non-unique route name: {route.name}")
            temp_routes.add(route.name)


def simplify_operation_ids(app: FastAPI) -> None:
    """简化操作 ID，以便生成的客户端具有更简单的 API 函数名称。"""
    for route in app.routes:
        if isinstance(route, APIRoute):
            route.operation_id = route.name
