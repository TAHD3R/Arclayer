from __future__ import annotations

from fastapi import APIRouter

from src.modules.commerce.dunning.schema import PaymentRestrictedErrorMeta

router = APIRouter(tags=["domain.commerce.dunning"])


def payment_restricted_error_metadata() -> PaymentRestrictedErrorMeta:
    """Expose one typed metadata shape for Product API and worker entry points."""

    return PaymentRestrictedErrorMeta()
