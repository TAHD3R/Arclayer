from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        CREATE TABLE IF NOT EXISTS "users" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "username" VARCHAR(64) NOT NULL UNIQUE,
    "email" VARCHAR(255) UNIQUE,
    "phone" VARCHAR(32) UNIQUE,
    "status" VARCHAR(8) NOT NULL DEFAULT 'active',
    "display_name" VARCHAR(64),
    "avatar_url" VARCHAR(512),
    "last_login_at" TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS "idx_users_created_43d91f" ON "users" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_users_usernam_266d85" ON "users" ("username");
CREATE INDEX IF NOT EXISTS "idx_users_status_941fc1" ON "users" ("status");
COMMENT ON COLUMN "users"."status" IS 'ACTIVE: active\nDISABLED: disabled\nLOCKED: locked';
        CREATE TABLE IF NOT EXISTS "user_credentials" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "password_hash" VARCHAR(255) NOT NULL,
    "password_updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" UUID NOT NULL UNIQUE REFERENCES "users" ("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_user_creden_created_0644cc" ON "user_credentials" ("created_at");"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        DROP TABLE IF EXISTS "users";
        DROP TABLE IF EXISTS "user_credentials";"""


MODELS_STATE = (
    "eJztmW1v2jAQgP9KlE+dtKGVUoqqaVIKTGNry9TSbdqLIjc2YNWxs9hpiyb++2wnIW+EEQ"
    "YdbHxBcL6z7x7b57P5aboMIsJrFvKxMzZPjZ8mBS6SX3Itzw0TeF4iVwIBbolWBYnOLRc+"
    "cISUDgHhSIog4o6PPYEZlVIaEKKEzJGKmI4SUUDxjwDZgo2QGCNfNnz9LsWYQvSIePzTu7"
    "OHGBGYcRVDNbaW22LiaVmPijdaUY12azuMBC5NlL2JGDM608ZUKOkIUeQDgVT3wg+U+8q7"
    "KM44otDTRCV0MWUD0RAERKTCXZKBw6jiJ73hOsCRGuVF/bBx0mgdNRstqaI9mUlOpmF4Se"
    "yhoSZwOTCnuh0IEGpojAm3e+Rz5VIBXnsM/Pn0UiY5hNLxPMIY2CKGsSCBmCycNVF0waNN"
    "EB0JtcDrx8cLmH20rtpvrasDqfVMRcPkYg7X+GXUVA/bFNgEpNoaFSBG6rsJ8PDlyyUASq"
    "1SgLotC1COKFC4B7MQ3133L+dDTJnkQN5QGeBXiB3x3CCYi+/biXUBRRW1ctrl/AdJwzu4"
    "sD7nubbP+2eaAuNi5OtedAdnkrFKmcO71OZXglvg3D0AH9qFFlZnZbrFJrfu5iWAgpFmpS"
    "JW8UWHyA3XCb1wuGj5wqMlkBp8u06Wm5tep8LREgQY1pTNKqvw9yeM+WoYUEcxMCRFXgMe"
    "rjnMdRmtYchravST1+ZGVqlekEfNZ/nFp4NdfPI4PlIUbDBny3dki8AuKtn2GcscaxiZ1u"
    "Iv69n56z7WZQiwT8kk6noB4kHvons9sC4+ZLJBxxp0VUtdSyc56UEzlyFmnRifeoO3hvpp"
    "fOlfdvPzNtMbfDGVTyAQzKbswQYwRSGWxqQyeTzw4IrzmrV8mnld+0H5r0xs5HxqXmUa1t"
    "8rVDlpm/WUOhuvtzOFTrOxRJ3TbJSWOaopW+UgF2BSBeHMYCV+EZ2/hG8jhbYnKVRahDOD"
    "HSR4VF8C4FG9lJ9qyuLjAoiAz+fXpYGrGfakS4A6qMAysd7UzaVY3ciKD9+jYv1iWu1B72"
    "P31AgVvtFO79o6O+92Tg2IuRoRfqPn/fZ7JSHMuUPh2qg4Ba0lZqBVOgGtPH/pmkfAxK6a"
    "SvN2a1nMT31xXH8+BfeyvvTtwK+UVLNWO4ny+HCZ1CC1SmHqtixNAriwCRthukL5VjBeQw"
    "X39JR3pGCLwy6U4pu67mcubhBRgcGcLXcWGfcpGjD5cYUIEPMfC1P3/3amx21dEok08mK6"
    "whNIKtSSx5AsjMXPInYyF/sXkv0Lyf6F5K/n5f0LyX8zsYUXEg9w/sDkyTkGfFzphpo33M"
    "2/hTZz3Y/ZrL5rSrrYb59ty4uqoqlWTKRMnrai2Ngl4zf1wh+V91nURc5x1V54Ayov3beY"
    "bqFel2IfPMwK2PTikcHJkJAIE7V13bY6XXP6p/9+Tn8BkMFiGA=="
)
