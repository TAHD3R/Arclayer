"""Frozen Commerce enum values required only while replaying historical migrations."""

from __future__ import annotations

from enum import StrEnum


class CommercePlanTier(StrEnum):
    FREE = "free"
    PREMIUM = "premium"
    ENTERPRISE = "enterprise"


class BillingCycle(StrEnum):
    MONTHLY = "monthly"
    YEARLY = "yearly"


class CreditLedgerEntryType(StrEnum):
    PERIOD_GRANT = "period_grant"
    RESERVATION = "reservation"
    COMMIT = "commit"
    RELEASE = "release"
    ADJUSTMENT = "adjustment"
    EXPIRATION = "expiration"


class CreditRefreshInterval(StrEnum):
    DAILY = "daily"
    MONTHLY = "monthly"
    YEARLY = "yearly"
    NONE = "none"


class SubscriptionChangeRequestStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    CANCELED = "canceled"


class SubscriptionStatus(StrEnum):
    TRIALING = "trialing"
    ACTIVE = "active"
    PAST_DUE = "past_due"
    CANCELED = "canceled"


class BillingProviderMode(StrEnum):
    TEST = "test"
    LIVE = "live"


class ConnectorEventInboxStatus(StrEnum):
    RECEIVED = "received"
    PROCESSING = "processing"
    PROCESSED = "processed"
    FAILED = "failed"
