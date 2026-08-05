from src.config import Settings
from src.modules.commerce.member_credit_read_repository import TortoiseMemberCreditReadRepository
from src.modules.commerce.member_credit_read_service import MemberCreditReadService
from src.modules.commerce.member_credit_repository import TortoiseMemberCreditConfigurationRepository
from src.modules.commerce.member_credit_service import MemberCreditConfigurationService
from src.modules.commerce.service import build_commerce_service


def build_member_credit_configuration_service(settings: Settings) -> MemberCreditConfigurationService:
    return MemberCreditConfigurationService(
        settings,
        repository=TortoiseMemberCreditConfigurationRepository(),
    )


def build_member_credit_read_service(settings: Settings) -> MemberCreditReadService:
    return MemberCreditReadService(
        settings,
        repository=TortoiseMemberCreditReadRepository(),
        commerce=build_commerce_service(settings),
    )
