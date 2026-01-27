from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        DROP TABLE IF EXISTS "org_user_positions";
        DROP TABLE IF EXISTS "rbac_org_position_roles";
        DROP TABLE IF EXISTS "org_positions";
        DROP TABLE IF EXISTS "org_user_departments";
        DROP TABLE IF EXISTS "rbac_org_department_roles";
        DROP TABLE IF EXISTS "org_departments";
        DROP TABLE IF EXISTS "org_change_logs";"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        """


MODELS_STATE = (
    "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"
    "2A=="
)
