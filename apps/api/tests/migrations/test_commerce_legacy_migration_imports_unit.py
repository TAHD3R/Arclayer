from __future__ import annotations

from importlib import import_module


def test_historical_commerce_migrations_import_only_frozen_legacy_enums() -> None:
    migration_0007 = import_module("src.migrations.0007_auto_20260712_2109")
    migration_0058 = import_module("src.migrations.0058_auto_20260722_1728")

    assert migration_0007.CommercePlanTier.FREE.value == "free"
    assert migration_0007.SubscriptionStatus.TRIALING.value == "trialing"
    assert migration_0058.BillingProviderMode.LIVE.value == "live"
    assert migration_0058.ConnectorEventInboxStatus.PROCESSED.value == "processed"
