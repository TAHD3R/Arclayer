from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="离线导出 FastAPI OpenAPI JSON（用于前端 SDK 生成）")
    parser.add_argument(
        "--out",
        required=True,
        help="输出文件路径（建议指向 packages/api-client/openapi.json）",
    )
    return parser.parse_args()


_NON_ALNUM = re.compile(r"[^a-z0-9]+")


def _normalize_tag_prefix(tag: str) -> str:
    """
    将 OpenAPI tag 归一化为 operationId 前缀。

    目标：
    - 生成稳定、可读、且基本不会冲突的 operationId
    - 避免要求全项目的 route.name 必须全局唯一
    """

    normalized = tag.strip().lower()
    normalized = _NON_ALNUM.sub("_", normalized)
    normalized = normalized.strip("_")
    return normalized


def _assign_stable_operation_ids(app) -> None:
    """
    为所有 APIRoute 分配稳定且可读的 operationId。

    规则（按优先级）：
    1) 若路由有 tags，则使用第一个 tag 作为前缀：{tag_prefix}_{route.name}
    2) 否则使用 route.name

    同时校验 operationId 全局唯一，避免 SDK 生成时发生冲突。
    """

    from fastapi.routing import APIRoute

    operation_ids: dict[str, list[tuple[str, str]]] = {}
    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        base = (route.name or "").strip()
        if not base:
            # FastAPI 通常总会给 name，这里防御性处理一下
            base = "unnamed"

        tags = [t for t in (route.tags or []) if isinstance(t, str) and t.strip()]
        prefix = _normalize_tag_prefix(tags[0]) if tags else ""
        operation_id = f"{prefix}_{base}" if prefix else base

        route.operation_id = operation_id

        # 统计冲突：同一 operationId 可能对应多个 method/path 组合
        method = ",".join(sorted(route.methods or []))
        operation_ids.setdefault(operation_id, []).append((method, route.path))

    duplicates = {op: refs for op, refs in operation_ids.items() if len(refs) > 1}
    if duplicates:
        preview = "; ".join(
            f"{op} -> {refs[:3]}{' ...' if len(refs) > 3 else ''}" for op, refs in sorted(duplicates.items())[:5]
        )
        raise ValueError(f"Non-unique operationId detected (showing first 5): {preview}")


def main() -> None:
    args = _parse_args()
    out_path = Path(args.out).expanduser().resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)

    # 仅构建路由与 OpenAPI，不触发 lifespan（不会连接 DB/Valkey）
    from src.core.registry import create_app

    app = create_app()
    _assign_stable_operation_ids(app)

    schema: dict[str, Any] = app.openapi()

    out_path.write_text(
        json.dumps(schema, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
