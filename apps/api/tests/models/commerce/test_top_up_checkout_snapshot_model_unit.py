from src.models.commerce.payments import CommerceCheckoutSession


def test_checkout_session_exposes_immutable_top_up_offer_revision_snapshot() -> None:
    field = CommerceCheckoutSession._meta.fields_map["top_up_offer_revision"]

    assert field.null is True
