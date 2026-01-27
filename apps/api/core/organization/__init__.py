"""Organization core domain."""

# Keep this package `__init__` intentionally light to avoid import cycles during
# unit tests and early app bootstrapping. Import submodules directly:
# - apps.api.core.organization.select
# - apps.api.core.organization.deps
# - apps.api.core.organization.context
