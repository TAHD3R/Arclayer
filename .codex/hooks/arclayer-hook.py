#!/usr/bin/env python3
"""Thin Codex adapter for the shared Arclayer project-hook runtime."""

from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.dont_write_bytecode = True
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

from agent_hooks import Platform, dispatch_from_stdio

if __name__ == "__main__":
    dispatch_from_stdio(Platform.CODEX, PROJECT_ROOT)
