"""
Auth package.

IMPORTANT: Do not import FastAPI routers in package __init__.

Rationale:
Python executes the package `__init__` before importing submodules. If we import
`router` here, modules that only need `auth.deps` may inadvertently trigger router
imports during app boot, causing circular imports (router -> authz -> org deps -> auth.deps).
"""

__all__: list[str] = []
