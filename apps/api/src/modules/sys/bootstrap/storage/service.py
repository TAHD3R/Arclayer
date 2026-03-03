from __future__ import annotations

from apps.api.src.config import Settings
from apps.api.src.core.logging import get_logger
from apps.api.src.models.sys.sys_config_active import SysConfigActive
from apps.api.src.modules.sys.settings.namespaces.schema import SYS_NAMESPACE_STORAGE
from apps.api.src.modules.sys.settings.service import SysConfigService
from apps.api.src.settings.crypto import master_key_exists

logger = get_logger(__name__)

DEFAULT_S3_PRESIGN_EXPIRES_SECONDS = 900


def _rustfs_dev_seed() -> dict[str, object]:
    """
    Development-only seed for RustFS (S3-compatible) when SaaS mode is enabled.

    Notes:
    - This is a convenience default for local development only.
    - Production should provide real S3 settings via env/sys-config.
    """

    endpoint = "http://127.0.0.1:9000"
    private_bucket = "celestial"
    public_bucket = "celestial-public"
    return {
        "provider": "s3",
        "s3_endpoint_url": endpoint,
        "s3_bucket": private_bucket,
        "s3_public_bucket": public_bucket,
        "s3_access_key_id": "rustfsadmin",
        "s3_secret_access_key": "rustfsadmin",
        "s3_force_path_style": True,
        "public_delivery_mode": "direct",
        # RustFS default public path style: http://host/{bucket}/{key}
        "public_base_url": f"{endpoint}/{public_bucket}",
    }


def _build_storage_seed_from_env(settings: Settings) -> dict[str, object] | None:
    storage = settings.storage
    provider = str(getattr(storage, "provider", "") or "").strip() or "local"
    if provider != "s3":
        return None

    endpoint_url = str(getattr(storage, "s3_endpoint_url", "") or "").strip()
    bucket = str(getattr(storage, "s3_bucket", "") or "").strip()
    access_key_id = str(getattr(storage, "s3_access_key_id", "") or "").strip()
    secret = getattr(storage, "s3_secret_access_key", None)
    secret_value = secret.get_secret_value() if secret is not None else ""

    if not endpoint_url or not bucket or not access_key_id or not secret_value:
        return None

    out: dict[str, object] = {
        "provider": "s3",
        "s3_endpoint_url": endpoint_url,
        "s3_region": (str(getattr(storage, "s3_region", "") or "").strip() or None),
        "s3_bucket": bucket,
        "s3_access_key_id": access_key_id,
        "s3_secret_access_key": secret_value,
        "s3_force_path_style": bool(getattr(storage, "s3_force_path_style", False)),
        "s3_presign_expires_seconds": int(
            getattr(storage, "s3_presign_expires_seconds", DEFAULT_S3_PRESIGN_EXPIRES_SECONDS)
            or DEFAULT_S3_PRESIGN_EXPIRES_SECONDS
        ),
    }

    public_bucket = str(getattr(storage, "s3_public_bucket", "") or "").strip()
    if public_bucket:
        out["s3_public_bucket"] = public_bucket

    mode = str(getattr(storage, "public_delivery_mode", "") or "").strip()
    if mode:
        out["public_delivery_mode"] = mode

    public_base_url = str(getattr(storage, "public_base_url", "") or "").strip()
    if public_base_url:
        out["public_base_url"] = public_base_url

    return out


async def bootstrap_saas_storage_defaults(*, settings: Settings) -> None:
    """
    Bootstrap sys-config storage namespace for SaaS deployments.

    Goal:
    - In SaaS mode, prefer S3 as the default storage backend.
    - Persist the initial storage config into sys-config (revisions + active) and activate it,
      so subsequent runtime settings come from DB (not env).

    Guardrails:
    - Best-effort and non-fatal: never crash app startup.
    - Never generates master key automatically (must be explicitly provisioned/repaired).
    - Skips when already configured (active revision exists).
    """

    if settings.app_env == "test":
        return
    if settings.application.deployment_mode != "saas":
        return
    if not settings.database.enabled:
        return

    try:
        active = await SysConfigActive.get_or_none(namespace=SYS_NAMESPACE_STORAGE)
        if active is not None:
            return
    except Exception as exc:
        logger.warning(
            "Sys storage bootstrap: probe active failed",
            action="sys_storage_bootstrap_probe_active_failed",
            error=str(exc),
        )
        return

    # Avoid cascading failures: if master key is missing, sys-config activation would fail anyway.
    if not master_key_exists(settings.setup.master_key_path):
        logger.warning(
            "Sys storage bootstrap skipped (master key missing)",
            action="sys_storage_bootstrap_master_key_missing",
        )
        return

    seed = _build_storage_seed_from_env(settings)
    if seed is None and settings.app_env != "production":
        seed = _rustfs_dev_seed()
    if seed is None:
        logger.info(
            "Sys storage bootstrap skipped (no S3 seed available)",
            action="sys_storage_bootstrap_no_seed",
        )
        return

    service = SysConfigService(settings)
    try:
        # Patch the storage section and activate immediately. Activation runs checks
        # (including S3 connectivity + ensure bucket).
        await service.patch_namespace(
            SYS_NAMESPACE_STORAGE,
            patch={"storage": seed},
            updated_by=None,
            activate=True,
        )
        logger.info(
            "Sys storage bootstrap completed",
            action="sys_storage_bootstrap_completed",
            provider="s3",
            endpoint_url=str(seed.get("s3_endpoint_url") or ""),
            bucket=str(seed.get("s3_bucket") or ""),
        )
    except Exception as exc:
        # Best-effort only: do not crash the app. Operators can configure via sys UI.
        logger.warning(
            "Sys storage bootstrap failed",
            action="sys_storage_bootstrap_failed",
            error=str(exc),
        )
