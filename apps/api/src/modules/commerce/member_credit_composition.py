from src.config import Settings
from src.modules.commerce.member_credit_repository import TortoiseMemberCreditConfigurationRepository
from src.modules.commerce.member_credit_service import MemberCreditConfigurationService


def build_member_credit_configuration_service(settings: Settings) -> MemberCreditConfigurationService:
    return MemberCreditConfigurationService(
        settings,
        repository=TortoiseMemberCreditConfigurationRepository(),
    )
