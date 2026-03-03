from __future__ import annotations

"""
Sites schemas (compatibility re-export).

This module re-exports schema classes from semantic subdomains under
`apps.api.src.modules.sites.*` to keep import paths stable while satisfying the
hard file-size limits.

Prefer importing from the subdomain `schema.py` modules directly when possible.
"""

from apps.api.src.modules.sites.entries.schema import *
from apps.api.src.modules.sites.entry.types.schema import *
from apps.api.src.modules.sites.pages.schema import *
from apps.api.src.modules.sites.patterns.schema import *
from apps.api.src.modules.sites.presence.schema import *
from apps.api.src.modules.sites.preview.tokens.schema import *
from apps.api.src.modules.sites.routes.schema import *
from apps.api.src.modules.sites.routing.templates.schema import *
from apps.api.src.modules.sites.runtime.schema import *
from apps.api.src.modules.sites.settings.schema import *
