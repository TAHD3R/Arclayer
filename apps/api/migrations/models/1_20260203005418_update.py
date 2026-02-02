from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        CREATE TABLE IF NOT EXISTS "sites" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "slug" VARCHAR(64) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "default_locale" VARCHAR(16) NOT NULL DEFAULT 'zh-CN',
    "fallback_locale" VARCHAR(16) NOT NULL DEFAULT 'en-US',
    "primary_host" VARCHAR(255) UNIQUE,
    "is_active" BOOL NOT NULL DEFAULT True,
    "created_by_user_id" UUID,
    "workspace_id" UUID NOT NULL REFERENCES "workspaces" ("id") ON DELETE CASCADE,
    CONSTRAINT "uid_sites_workspa_ed7f39" UNIQUE ("workspace_id", "slug")
);
CREATE INDEX IF NOT EXISTS "idx_sites_created_55e286" ON "sites" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_sites_slug_d794d7" ON "sites" ("slug");
CREATE INDEX IF NOT EXISTS "idx_sites_is_acti_b4a8ea" ON "sites" ("is_active");
CREATE INDEX IF NOT EXISTS "idx_sites_created_0050d9" ON "sites" ("created_by_user_id");
COMMENT ON TABLE "sites" IS 'Site (public portal boundary).';
        CREATE TABLE IF NOT EXISTS "entry_types" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "fields_schema" JSONB,
    "site_id" UUID NOT NULL REFERENCES "sites" ("id") ON DELETE CASCADE,
    CONSTRAINT "uid_entry_types_site_id_5ca046" UNIQUE ("site_id", "code")
);
CREATE INDEX IF NOT EXISTS "idx_entry_types_created_1b1fc5" ON "entry_types" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_entry_types_code_5cca46" ON "entry_types" ("code");
COMMENT ON TABLE "entry_types" IS 'Entry type schema (e.g. blog_post).';
        CREATE TABLE IF NOT EXISTS "entries" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "slug" VARCHAR(256) NOT NULL,
    "draft_rev" INT NOT NULL DEFAULT 0,
    "published_rev" INT,
    "created_by_user_id" UUID,
    "entry_type_id" UUID NOT NULL REFERENCES "entry_types" ("id") ON DELETE CASCADE,
    "site_id" UUID NOT NULL REFERENCES "sites" ("id") ON DELETE CASCADE,
    CONSTRAINT "uid_entries_entry_t_f35617" UNIQUE ("entry_type_id", "slug")
);
CREATE INDEX IF NOT EXISTS "idx_entries_created_0f901a" ON "entries" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_entries_slug_f167d1" ON "entries" ("slug");
CREATE INDEX IF NOT EXISTS "idx_entries_created_4b6441" ON "entries" ("created_by_user_id");
COMMENT ON TABLE "entries" IS 'Entry instance (e.g. a blog post identified by slug).';
        CREATE TABLE IF NOT EXISTS "entry_revisions" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rev" INT NOT NULL,
    "data" JSONB,
    "document" JSONB,
    "created_by_user_id" UUID,
    "entry_id" UUID NOT NULL REFERENCES "entries" ("id") ON DELETE CASCADE,
    CONSTRAINT "uid_entry_revis_entry_i_fdf7b0" UNIQUE ("entry_id", "rev")
);
CREATE INDEX IF NOT EXISTS "idx_entry_revis_created_beece6" ON "entry_revisions" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_entry_revis_created_9726a3" ON "entry_revisions" ("created_by_user_id");
COMMENT ON TABLE "entry_revisions" IS 'Immutable entry revision snapshot (data + optional DocumentIR JSON).';
        CREATE TABLE IF NOT EXISTS "site_pages" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "path" VARCHAR(512) NOT NULL,
    "sort_order" INT NOT NULL DEFAULT 0,
    "visibility" VARCHAR(7) NOT NULL DEFAULT 'public',
    "draft_rev" INT NOT NULL DEFAULT 0,
    "published_rev" INT,
    "created_by_user_id" UUID,
    "parent_id" UUID REFERENCES "site_pages" ("id") ON DELETE SET NULL,
    "site_id" UUID NOT NULL REFERENCES "sites" ("id") ON DELETE CASCADE,
    CONSTRAINT "uid_site_pages_site_id_8e7d81" UNIQUE ("site_id", "path")
);
CREATE INDEX IF NOT EXISTS "idx_site_pages_created_1829ed" ON "site_pages" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_site_pages_path_4d9011" ON "site_pages" ("path");
CREATE INDEX IF NOT EXISTS "idx_site_pages_visibil_8d9703" ON "site_pages" ("visibility");
CREATE INDEX IF NOT EXISTS "idx_site_pages_created_0e3225" ON "site_pages" ("created_by_user_id");
COMMENT ON COLUMN "site_pages"."visibility" IS 'PUBLIC: public\nPRIVATE: private';
COMMENT ON TABLE "site_pages" IS 'A site page identified by a unique path (per site).';
        CREATE TABLE IF NOT EXISTS "site_page_revisions" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rev" INT NOT NULL,
    "document" JSONB NOT NULL,
    "created_by_user_id" UUID,
    "page_id" UUID NOT NULL REFERENCES "site_pages" ("id") ON DELETE CASCADE,
    CONSTRAINT "uid_site_page_r_page_id_1d410c" UNIQUE ("page_id", "rev")
);
CREATE INDEX IF NOT EXISTS "idx_site_page_r_created_02ca21" ON "site_page_revisions" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_site_page_r_created_cc0292" ON "site_page_revisions" ("created_by_user_id");
COMMENT ON TABLE "site_page_revisions" IS 'Immutable page revision snapshot (DocumentIR JSON payload).';
        CREATE TABLE IF NOT EXISTS "route_templates" (
    "id" UUID NOT NULL PRIMARY KEY,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "path_pattern" VARCHAR(256) NOT NULL,
    "is_active" BOOL NOT NULL DEFAULT True,
    "entry_type_id" UUID NOT NULL REFERENCES "entry_types" ("id") ON DELETE CASCADE,
    "site_id" UUID NOT NULL REFERENCES "sites" ("id") ON DELETE CASCADE,
    "template_page_revision_id" UUID REFERENCES "site_page_revisions" ("id") ON DELETE SET NULL,
    CONSTRAINT "uid_route_templ_site_id_412afd" UNIQUE ("site_id", "path_pattern")
);
CREATE INDEX IF NOT EXISTS "idx_route_templ_created_84a8ec" ON "route_templates" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_route_templ_path_pa_2ec1ef" ON "route_templates" ("path_pattern");
CREATE INDEX IF NOT EXISTS "idx_route_templ_is_acti_65f325" ON "route_templates" ("is_active");
COMMENT ON TABLE "route_templates" IS 'Dynamic route template binding (e.g. /blog/:slug -> blog_post entries).';"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        DROP TABLE IF EXISTS "route_templates";
        DROP TABLE IF EXISTS "site_page_revisions";
        DROP TABLE IF EXISTS "site_pages";
        DROP TABLE IF EXISTS "entry_revisions";
        DROP TABLE IF EXISTS "entries";
        DROP TABLE IF EXISTS "entry_types";
        DROP TABLE IF EXISTS "sites";"""


MODELS_STATE = (
    "eJztfWtX4zi29l/R4hO1BigKiqrqzHvOWkDRPTlNAcOla84ZZhnFFokGx3L7Eio9q//7qy"
    "3bie+xEjuxieZDT+Foy/ZjWd772bf/7IyZQUz34NQYU+sbsfy+R8Y7PfSfHQuPCf9H/oA9"
    "tINte/4zHPDwwBQSGIZqYz5Wo3yw+BEPXM/Busd/f8amS/ghg7i6Q22PMgukxAkQSCGQQq"
    "7HHGIgfuzrGXpmDjKm/JKojhzme9QaHsC0BtP5vPyvpWZ4tB6tfaTzO0DURXQ89sU9IGwZ"
    "yB0x3zTQgCDPIdjj82AXYT6nGEENYnn0mRLnAKbgEBA+RMMeIhYMcJHLnr3wONp9IcR20Y"
    "jCFU3FpWDfoN57h5nmAOsv78TN+Bb93Seax4bEGxGH39I//8UPU8sgP4gb/Wm/aPy8ppF4"
    "SNSACcRxzZva4tjDQ//rz2IkADXQdGb6Y2s+2p56I2bNhvs+NQ5ABn4bEos4cNex52X5ph"
    "k+4uhQcMX8gOf4ZHapxvyAQZ6xb8JT3/l/z76lw8NGfOW4B9imBzobj5l1wB8GX2DUcA/g"
    "Gj7/905mccCpU087PKQzCxYWtTwA6D9/Brc6B0Ic3YHzn//t9Hb3+NM7cevM9YaO+FHAtP"
    "OnEMQeDkQF2HN09WAF8MebRfkr/8WjY5KPdFIyhbgRih5E/1gG+ehACfQRestBusNvwbi2"
    "zGk4dQnE9/1vF3f3p99u4EbGrvu7KRA6vb+AX47E0Wnq6G7wRBjfHILdYzYJ+t6//xuCP9"
    "H/XV9dpJ/bbNz9/+3ANWHfY5rFXjVsxFCIjkZI8ZHz5+rbxpLPNSm5nuc63zfVg0082PDi"
    "Y+8r39GzT/R8hJ2CtzQcn3qOHKxm9sIVn9sY/9BMYg29Ef/z08eS5/bb6a3Y9j59TD2Lq/"
    "CXI/HTnwn0POqZUvDNBOrBbw0rP4Hgh6MvFSDkowoxFL/lgKjRD18saSRnUkvBGS62t4Um"
    "5aeUwTEa30kEG3ij4f5z4buw/LGAsM8vCFs6yS7JULapdzurKNLQwEjZB7/cXj/c9NCQK+"
    "/2o9W/v/jWQ7OhkhCfVED4pBDgkzS+NuazSizPaHwnl+fRyacK6PFRhfiJ35IIiv+XQDAa"
    "3xCCjX6xG9khuSllM4sbpdoLmcrpPinBTi7KRjB1iEEdoucYB8VwxmU6iWQjr7fLnBwU+5"
    "aXD2I0PAUgv+CGvjmHK6A3hHPsH334+Pnjl+NPH7/wIeI6Zkc+l+DZv7pPqzquhnWPTnK2"
    "wzPGTIKtApUnLpcCbsAFG0JudqBuuubs+voyYW2e9e9TK+7h29kFf6nFQuSDuDKQD6lNnD"
    "F1XX5tmqxlmCOqPjkRMUw8nMXyf+6ur/KxjManAHyw+K3906C6t4dM6nr/auUmWQIf3HFi"
    "pUao7X47/Uca0PPL67M04QETnKXAnTPKstRUUrIGamrta7cjRFSEQynFaGMHdCs5fj4htA"
    "JN36rXZAH/Dq6N55dc+j2AIwvgz8whdGj9SqYZEzYFWpEPq634zY/Or8LBrzPHT3KF8BsN"
    "Xnr45e7iHl09XF7uCETBufSKHUMrgFYfUdPgU+UoG6Hkz7/eEhOL+3iDuAqQ2BGLgZOALf"
    "vT+GicPoItPBRXDeeGM0WwEIfqo508Z2rwy16pF3U+ZpHvtBiGml2KhRp77laVo6+HT36j"
    "9HktCnuxs3BCHJfK0ZUxkW5S6EcnVRg1PqrEaMywavBqSIAYDu8mgB8OD6so6IeHxQo6/J"
    "bmhCwv98NZrKPHRGpQ0zcA6zr09IyqUvylbfTz4rrE+5mZBnFuic6c5PZdOKj8owPDtWcx"
    "vmrcDoigQATtvjLnxbWxTvZdndlB9M3k6F1OsE4lMYjQuWIecXsQZnM/gjAdCMMx2ZDq2E"
    "TMGWKL/iH0E2TiKZ8Lomv4tw6JW+FLdeBgZyqidCZHveRRmItrUh5iz2h2BWjI+H5sgSa5"
    "h1yGsGlGlwl7PsiE1ziYzqW4KlYUw/PPnfgosaji2pt4YP9SgT4q0EcF+qhAHxXoIxPok9"
    "5Yq+6LmQ25xh1yk/TYwq1vQx7XjevX9cdUxC9LAsaUWCddhCcfjqrET3w4Ko6ggN+yLkKN"
    "66fEkXQUzoWachdm0WyRv1ARzG0imPOsrbZi2DWSudPYJpktuBW3Bji6CETjlMgCMqQyDe"
    "LMBy4kQfqz3KGByQYIXN1gZGZpj6KBSaLjltgm1rkIwhaiY36zaBdP+DjnvQ7sxHuTDdm7"
    "KEcpsD0RRhZ5RbF7FHlMgQGDHPJM+CuoE1dQITejqSsIFPFOg61OXTTi482A1wAChd//VI"
    "cLpRb/N9CCMM5mJtWnaDdcJz300yEy8NRVKUyK2VDMhmI2FLOhmI3NMhvsld+W5rv8P3LY"
    "ZQQbtYxaiZ3tO3zE0skiMfG15YvkwrZz+tvp/eltDwVa06N117+/0C6vf7nuIZd6RAMF6t"
    "H6+fS3/vn1FZxnAjlDj9Zl/+z29PZ/e5GL6NE6vb8/Pf/bt4urez6b52F9NOaqED9+e98/"
    "v7zQzq9/u4ATOR7lu4Qm9LO02lfJBXxcxQN8XOwAPk5TKhPq0gE1qVeQELD4eSZnWF8KkO"
    "0PuJaZVaJ2bh7OLvvnPRQMeLRubvv8QV/wAw7lT5rwB83BuPjKnzK/QWIs8yDK+JfoOXwu"
    "fAyfM7lrcJ8CjKy9VxrQHZdbX0C3bITRRiK615yiumnCtZmcDNMfykAYje8kgo0EwDOHDq"
    "mFTT4nP5GkPyVXuJPYNhL8NaZycEbjO4lgI6uT/JBKXAuHdxK/4yr+qONid9Rx1htF/yDa"
    "YOqRPJaWDosdUgm5Ljmkfjo6Oj7+fHR4/OnLycfPn0++HM48U9mfylSks/4v8MFOQJ39gu"
    "sjor+4/ljjehr/OMms1BzRLuZk1e+ShupSeEg022ETmutILfm658iuz9W/YzIdmyuQpk3v"
    "B2zwb6JL51YnpboZOfHh8KjKQoVhJbHJR5nFOsEOxVaeF6w4Ojkuo7II9xZnEaoUTZWiqV"
    "I0F7hQguBuSa44IaQiaAI4sgBueQRNYpWsEEEjyEzNpNZLHVEjdzDbJZ+sMsKbS+QpD6Tx"
    "8LA2VO7x8E1g4rtcj68DkAeYqJNwNB5ilH6DimKNct60RblXqVd9cegRTL/PLHMauDwQ1n"
    "XiukGRYeRy/MwwFyobjFRdFMKTbsnvPnUIeL+CKKUb4YRBUM2sh9677//jsRdi/Qk/nTPr"
    "mQ59R0Q6kR82dcSKC2KbsBGcNDzdru2QCSWv7w32apkMG++SwVACRCQQQfCvq+t7RCFN0S"
    "AG8hiUaA7XWA/CmeiEOFPEf7UZLBTENQH09I/9WzZgnrvP33L+SJkQeDqYJZUNpjbcqBuE"
    "T6G53+uv0VXyQUNRBjqMjmI25usciVtGf4ndI/+D3w8/DPqdCopSQVEqKKpOlV4FRW3Ng1"
    "VBUatufTFNGb5TUh7zSEAVxd4R7jH+fSfuEltKUlKRPZsle+aqmexzTEqq57jZ5xgpYIPp"
    "MpGe+dLbF+4ZmJxy2MVlmv2QdoL5FHDURXx2kW3ZS3Ge8fWRoDzPT+/OT79elDGejRM3SZ"
    "KviLbJUIGLSJsED7mYsvmGrem+x/b5tU4FsYEGxHslxArYFlckbvE53SxlIyeaW40m/oDg"
    "wvm/VPkZxUdIbzCKj1B8xFY92Pw8bqU+yRERwRdHArG5xLbgpdTNOtXN1OqrCzyuJL4F/O"
    "ZvVxuV9cWKupSSXlE/v6NjO3J9gjItUdayuig4OX8ltofG1KJjbAq3K//Q/BW9EqRjC5Ef"
    "4ONEr9QbIb4bMuc9pOAgky8zp3qtSVVeUun3Sr9X+r3S75W/cY1qviovOUOtsr8xo/ZXCQ"
    "0NdBsVBLmGqL94QGSRRpoKmlykk86DNasWWhcS83Je0hXXK8uDfvrggirqRuXX+fW9oMed"
    "1xHVR2jgu9SCyDgoDOZN0XsksIxVGkPBQHGnjzsi2O7Ot23meHyS71xjJfxqiPG4gx76cN"
    "ZAaTaIh0GPExGGQTYa4ko1hwaNREDfgHBNmQSVy8j7sErZPlQp45cfxOAF0heWCD989j2f"
    "j9eh1IJvv8e+QT1RuP3ZZK8u2iUHwwPkW3ApIYke3PxX4nKrkKvkUSDiU3Cn4sV5CurQB+"
    "hy9dyahPXRgH8P67INSKDDu1TUe5sim+vv1HIfLRSe9YmvE3LAT+nxWdynPfQUDDn48ePH"
    "0ztxE0/BG/1Cpk/RvPxKkcE8EXgZXf8TVDU5gKomMItL2AHjdh1UjnsqrMyWNRZiNxj7M/"
    "7xg1w2ZU0oa2LTWsqbUTqVNfFGH6yyJuqzJkrLkuWj1ppSZO0JYUx+3KsCmRLrJJjNFFjJ"
    "akeV0cx9k7cYy7lyKYFlQkhhqUIjVWik8lW3iZLa60ho5BljHly5fedhcUEZbis1Yq+M2X"
    "L4RWmDSEBzZxILGa5ri+yDZYJuz07P0WwKNMbOS+jzTDBaC8YDiRO1DHwBT6vIGoWTYRNy"
    "XsfQ2s9liGDHnO7z6xwSxB+Qbwv3q4ufCR8Fc4mEz2fquB7C0OpYZXUqXkTxIooXUbxIHb"
    "yIpNZfq77f9bREg1mydaUjEVVSOoPkMqW85mJrSQlco+Lfpm2kMCdQwmfepAZ9YXnOtNg1"
    "HP+5VHfm6qlDqzqExaxcqQ3sp9ARiKGx1BABtogaoO7yWxBVSyB6MMctvPQsuR5FuIGALA"
    "ztHFE2XHkMlWasNGOlGSvNWEozXmuLhk1z4Y00uTAc/OxpDplkYSys4Z6Q6VIJ9/p6CkNh"
    "N3fE9wU55DJyS6G3gW4CNeOnPDB1eGAyqmRVADOC2+KLSXaw8GRxi4lsC2Il3itAowbn1R"
    "2f5i34rmKLY3Ga5fwNrAFBYaDe82NvAcbM3iTrB0yUsqIuBDvnEIAScf8hNxHM1UWIGw38"
    "z0OnmOBJg1hO9Ey1xCOU6TIuxFEkjlwL2+6IeWgXbH/0F8TswM2JvjLdh4q9/VsEPQxy+J"
    "+6Ji2hg4KVDjqhIoIUESS9kSgiSBFBW/VgM0SQnBm+duqiXdY37HpZtIqbHkXjVdOj1LrN"
    "bXoUfvqlAI7JKJArgKz4o/r4o2WoI8WBxCGsy4Tvom25l2u+ty+CN82RFJmoSRplkXkaLK"
    "O96rEIIIBcfUTGOAwkgDACDRZdYeRBqQyE8N7ZXMBDxyIH+1dCbBGOG0rYeAotY9CzSX6I"
    "NGvsCps0qqZ0AMnWP4sM8B6aYJOCCovwEEPAQ5jArXth6npwKVPXI2Nu7j70YZIxgqaIoC"
    "MUW7kxbkznWCorV1m5yspVVq6ycuWsXLF3Zp5oSSPwcHwnwx3qjwXerpJLzaWhulqgW8iY"
    "uBlBZefuLbZzlY9a+ajX6qOu4laNhWCv7FTtHqRJ2pn5HFBuDdlQdHZFSG5hsvtwrk5C06"
    "QBf8UgxF4XGBbb8Dmj9srMeCs2vqIhf0OcfaANUVwWUWvAfiBHnFKi5Nwqk4Hpf+Mww9eh"
    "Jpwe+MnR7rffbt4JJuA66FvLXhOTB91rgSDQfcfh7zKazS/KqZ2bVH+Bkm04eU2gl+5Drq"
    "+LqAckAmjZoQSDVrho16DumLruO8SBYygztpAdSNfv4TdObcovLU7PGsTwbaLKqyn2oB22"
    "ylsxMhV78EYfrCqvturWFw8vyPkiVcUvV3gLQeSKBBmyPHcZUDAXlj/OWGPJr0ZMfrOM1s"
    "79xek3Ppjg8aN1d3H+cNu//98ecglXqag3fbTuT+9+5b9j9yWt8VVhbqrwNsWsTYaz8ahn"
    "SvFeM4FuEl+N5EkNmCFVhCEavxSEG0jwSSB48uGoAoJ8VCGC4rd0XytnCE1mmNRSjAt1cz"
    "k2CSZ4XmVY2JSY4mD3FnOwWPeYs8x3PyO4hRFGUPRdk/W7JKUa2kG7V7YyxoBIgJmU6uTn"
    "qBE0wcxbqsk9rtG+bdNr3SZrNsKhrdVsrp3hNzIeEMcdUXsnh4dODtgro6CZM+Qf5GhsRR"
    "L6ATjjuZRoDmIhPhW26B+CsM1yzRVkgFK+mrXzmByhAfMtAztTJC4cun/4Y+Ki06MewkgQ"
    "1wNiMmvoIo8h8oNfszlFzCLpaRH6DulTz8zRCfKg5CT2BAkN7OIAuwSZfNc30YRi9HDV//"
    "vDxW744QybfDjMDFqKiC4kQGHHz7AfSA/ZhDhWrEpP0CwEBc8RIqwLM7EUpawoZUUpK0pZ"
    "UcpSaVesiFlaTOdFsmuj8naCb19209u5/n51cdtD7JWf89E6/fqtf9ULChk/Wt8uoD5iD8"
    "WEZQPZqsSxFYexpRVXKBft54QalFQ9mkmsD2uuCdAJWeEDkzIBqoD4oRjFDxkY4+qDpGGf"
    "I7otoVaJTV2eElmbA6Q9iJUEp8XXURZF6SC169R0rUVxYZhazgu2uKQKrK0aUHwIp2lboe"
    "Sq2MVesTblXyUWZ77BnFi8pfbybGRFazk+OdrFus6tWi+0GTmgHoeTODnRWRXlwGrO2MpB"
    "CFZ8Am68gsUbTjOfQHTEFA0Ugj6cIzYmwsIdUNPkV/L+7u46aMr5PvIwIpuZVKckaOP5PX"
    "LQR6ewHfZvovPh1CNxo3h2hcKIHkyD6wE9B67G5QqZMo+VeazMY2UeK/O4++Vpu966QaVr"
    "rezkgnbXmu+YMjDGZTrpLmwk4IK62pzSSOV4lDUTScitr6PI7EDLGopI+O8SdnLaQ7Z8lk"
    "3GM9e+jaFS6tEsKndFPGbGw1vAQiNjTE2NWhO6cjrWDJgLmLMvpnwTGAXoaNy0fKkLogCd"
    "Sz5jxxBqkvK4IQ6kQxUQHrFf98roDns2riLZIVo9zqWyrEZ6QNLp/wRFA54iJsENCp/OOt"
    "w4e1ADhuqiPyTckXj8Ruhuf9wRZEIP63xbch93Qt994IXXqJF04MN9EDygJhAawIEMHebb"
    "IpNMZw6BgS6fEv49m0pkwD0J7sRhpoteR8QhAecxuyHRnHJA+HTY4ovwvT4i+gtcI/+OoI"
    "k7z3dTwQCK7VBsh2I7FNtRC9ux2eo062U7GrHWxcdt2XCKmfD6fPyvcdMh7XK5/aUHIXqP"
    "1vfr21/vbk7PL3ooKSAJ+U8VAP+pEO6fFLtU+3qNX1kGyXvyo6h9VFKsIxxT2T598Y/7xB"
    "adSTuZbdOX11e/RMPTuSjZ9anRD19yoC1fpDOhjgCbSt47PKySvHd4WJy8B78VLlRpSPNk"
    "FbKzRmiRaScDaUJoq9N7lqJD55auBjGUK1cdMkmSi2jft2wz9I1YpcWlhhK/75VSOGJk1R"
    "Y2oOCZJjGi5IWoDBC/UPpMXG/eduYvyPEtsHSAD3mmeb2LV55NsSOKHVHsiGJHFDuyIjuy"
    "IU3pLfIk22W6N20RKdN9r2bTnW8DI5YTi168QucSao3OYJwQx81dn8U4xkS6CWT9UXQO+d"
    "2nTp6VWAxjXEbhGOv0YzOa19mrpJRJQqqbWB6dnFR5uU9OSuppnaThfCWD/NrcxVjGRDry"
    "4VkDjg7hair1CsvqFb3gcSmF5jzK0/Xltsq5hEJxFnVMdWK5Uu92TKSTONb/vSlL867gDd"
    "5AyjeNuMYcd3D/ilvPl5cXX3toNuzR4sdu7+EYP+J4wZHrm5vgCLNtOPK1f3d6JgQN6sLl"
    "8WM/n/bFkWdMo9Nt1pnMr9bBQ6LZmM8usezTct1UEBoJuA+XxBI8WFJyLVW61mmxtoj2im"
    "67lNC0sf4Ca/yZv6uyzE2ebCe/D418ZyN0RICr64+XQTYu20lkG2EYI3Rc+kdewg8dFrYW"
    "T0su1WN8A5gGLcZ/Ojo6Pv58dHj86cvJx8+fT74cznqNZ38qazp+1v8FEn4SiGcbkadi25"
    "MoF1exTYmpKrapXTu3Y7bw6S7RuC0jqOCuDLc8zgrgEoAlomWaDAyBiJmdnICQ27CgWXEg"
    "yCxcZ3EYyPd00yeRteNEJToSQR4lY5O5PXCFLsIOmUfi7tsOnfCF1IsSfxh0jbIIMURJzw"
    "FBwSJCr9QbQcXQVLuou6AZtDObmY7HfpA0tKtjy2IezBGUoTGiSifUiaXruGg+jhiUDwtz"
    "fairuT4fBxVtntCYYAvSgUaYn8c04xM87lTvLaXaT6sQFhXCokJYVAhL1xJ81hzjq+qZtN"
    "AuV2ErKuOkE7ErKuOkKWTFgjM/HOZAWmxcJ4SUfb23mMCIL0JZtPNkFegVQAeLV9jTOZzz"
    "giJTc7n1FZnKpy7qQHfFKlMpTKMrlgY1JqhQzazUiJtZYrHGRRWyRXWaVJfexfxShhPOQT"
    "ILo3RV8JqrpG2oNnh6jcgWCE82/tBK3Xdbk4Oa//LO6xXWkaQ7W37z0oWRt6FDSDXtlCkv"
    "uJZdZOWOmvTyrlB5jUuh/f9G87MgKLInkm2n+x7bh//PSdKVkMv1cYirDXf9eW44P6D8HM"
    "rPselv05uhw5Wf440+2GyqbmITldgYM4Lb0uQo3RNOErf4B2xLECuxW/Kb6kmbLN1TENPm"
    "SmxZLG7/ZCdUuxWx66oxkkYwsyG1qSXULfM9ck/GNrd+SHGdnbxhC5R3LqB5oURF3f3rlJ"
    "+W6kgIo0gYDfgzFBWJRX3j9wOTDd/3oE0H6OvwlwbvNoI0T0rcHN2+pnkhjuvO5pN66Djo"
    "LAVhWq5v28zxkMunMsm+S4bQ4xjZ2OEQetxO5HbEC0FPYuYnEVUVAckHDQlyyIQKe4O6iA"
    "kssPlXKKpsIZvvV3yyPUS9qKCyqNwM4VfIxFN+P8h9gbUU1pjONU0gYTPa2bE3gkQXfl2W"
    "skyUZaIsE2WZKMtE0jKJ76GZJ1uW7ZOU62RE1tFJlSbAfFRJDlWmDbDq61O7B0vUvBDTS5"
    "qBGcFtMQYTea9zjakqbnElawsRi5RqDVRaLVJpJTEsnWQFVFsVtLI8J5Ffq0Xarr6jcROu"
    "tQtyoV0de+MWMxPzba0GBC9gsnt+7C3AmNnwF4OZ/57WtDRv+Jy34ZSV8d3YG74Q3tI9LQ"
    "H13cU9unq4vNwUFXRHPI/fcTEJlBywV0b/uMHQqj7bsOZxJAWFRxyCdsNMulmLK+BlIGQP"
    "TbDpkzwn7goT5VMnIDjbNoK/gkc3m0vRKIpG2byR9lasbUWjvNEHm+3Lndhaq5IoSan11d"
    "Wah3bXk5hVhUX5UEyifMhwKPFvU2WbNSaz5lDVncPwf/s5/4n+t6FvTDLPpSB6tTwbaybU"
    "SZKvkbRBoWplcSzOYJkJqLSV1ErNS1uJPnaDnBqkxTtAUmpbKZYN2VszY7fQ4EqO2Cu1uG"
    "hoY1a0uU4RSAQe6FlnYQMNpghH1UbAYYF2beKIoTnm1hJzgA89su7DXseGg589sIyfekgE"
    "C3jIxRM+z8wxbvkQcI12uR3CPGZRPepp7A/4BjDi6zeQTgvAX1AExWNIDNURACeu4TtBL4"
    "TYomvxTEzUiAaPPf+3aGccuOdFsx5olvyM+bXxtcRfn8BGgkoq7NHCE0YN5EIJFYgniOYT"
    "85AJcabo7u4WQUFvfnOV/fTKsFSG5eYVg7difyjD8o0+2Fz/vKxfvrOqejNlf5njafyjl5"
    "dWWlh0Mym0VMnNpV6DwxWgDApuHn34+Pnjl+NPH2d1NmdHysprZp3uQt+gJvUK+gAsLhme"
    "nGF99EagHmU/vTs3D2eX/fNeqD89Wje3/d/4K84PBCXr0jphlTVbBmq0Yj8XrtfPmTIfkf"
    "4osVgTMlu5VhO6swRyGbluFdetDb9ItxtMNUiil2Te8qUbtb9bky2e/FY73GyUzfCJC20J"
    "Z6Gik1QgTSsCaYKXryb0kuRWW1/XxRk+8Q1JOqYj9k0ZUdPgU2XRlalT0GFgkzmMEY1WFx"
    "ySMUUtemMbrdpQAFApH52GsgIvrSWeZ4Ue7LMa1sksqVmv9N2vTPch16p/GwTz2HhqMmzk"
    "dWBfba5ctlbcU/DKgyasyFpF1krvH4qsVWTtVj3YvI+8BPmwdsKmXZyDEX6kZKIo4jI1BF"
    "K0ywRspm2MYnZqYXaGsiRFTESRFAKNTZjZLTJ79jJ29nD1qonY1ZLFKbSogsJqdmZBiYzu"
    "2N5N25jldmVVW7Ki9QhTot0w6gfqc2ATDZhvGdjJq/5XPjxT+CMMfBoQk0GWicfiLZnQrk"
    "cszMfGJ9hHf4NaImN+cxAiRF0+A18qQcCUkA/qh6Anfp4xF9JGfPwTCi6RT4DQz77nO6Q3"
    "Kzgy5quB2lzEYGP+HF30FzQhDp9RFytVXNCzyV6r92WCCiXKkFWGrDJklSGrDFnJdBbYOz"
    "NPtCSRJRzfyagj1ZephQkW4aVqJtNxXvHCsmY3acn1wbrzx2j//GqFz2/TiVX8kk1QgpfA"
    "NUd0jcASa//hrsXAxhVdGVTTcrW0ZVqsTNb5/jfSiV5VUaq9ipKiAuugArvRTaUTpGCL26"
    "lsihSsr59KWOh1NRpQ1AbqItmaeGXnRYHqgON+2s1SSUlPZbai8brJ4rZCM0s7XWPQWpuw"
    "aJI5f7AhDukGO14xf54Zs1fGovtitGbz4RXJ9GB+KGntRemwkNK7Lw5wFfEFUmmB1oYkWf"
    "4t88ci1io4UV5B7jomzE+hJYnOD3w6LcgFVrS2orU3T6K9FfZT0dpv9MHmfNrnW2jmwRYn"
    "iSWltjVey6V/EG7952qLxXm0CaGtzE3UR0R/4R99zR3ho5NPMuRgjmgn27bX72EhHpZyUE"
    "XjOwlfIw4WNvg30T3thRSkd+fjmJTqqL/q8KjKeoRhxYCKH1MbJJRnzdG3S/nquVBjZHUW"
    "zXzLqGV0ddL6qZwbSraxW15Zeiipq4VZYOfeBfN1kdrYS6eKkrY2MsuDupAqyTyRhWxJeO"
    "NyhEkohHbDkD0XCUewqBt2dxwG8AHlsZApWW6mHIpEsSCKBVEsiGJBFAsiw4J0w4PdSuc/"
    "/04yZ5noiYzgFoJn+w4fIRVzFhNRoaXit2fKJ5cML43LdNNkbyTEbEzlYIzGKw6pCiV8Ro"
    "dvkBX+6ejo+Pjz0eHxpy8nHz9/PvlyOKOHsz+V8cRn/V+A8khgndP48IdNdNCk5LnjHNFO"
    "Ltz6t1B95FsvGqxBCUdGUqhLS7Y2R4bHPGzOIy0qApeS2krkXA97fg5o1cqozqXXV0KVWt"
    "SjYs4Mivz++vd9bsZ87aHZsEfr4eby+vRr/+qXXkjbcIAfrfPrbzeX3OCBwzob2ybx4sdh"
    "jvAwzHF6dn0rjuEBc8SRi3/c9G/hCN/OaEiUy/P9ldj+Eq4/430SF+MuYRknJTvJeHTEEI"
    "5wKKU4sOsS2YKdcZntC3/nvxBnAtzOEtDlCm8lhswEGGTTLDOCndToGjFFZtCQH1L5V2m5"
    "TiJ6XKVs/nFx1fzjTNH8jUUHbBrKpoIDZk4tLfTB5e2cJdxDvnhDEDecLlgl+ZKPKuFyMu"
    "mXi5oV5KO6sQYFsXYD7UxnFVcvbjEDZ3n6ZVxufemXnQho8bAz5FrPMzMNaf9Bnuz2KU4Q"
    "LAVVs2yHTWhuQ5eSEhU5smvMXxcRDrW98PV88DNRQ1XyCgv4H5n0qLwMn/Z5IDaTIOWKyJ"
    "ZspI8brNiS0B4+ompADx+KsK4z3/LQLnOG+3ho8TeP6mHjQy+vqlhlKRWoowJ12kdbvZl4"
    "DhWo80YfbCZQB7Z0WV9/XKYe9Wa9xWQaSBUZY2pKeU4jAVWLp6vuq3kJoHSj6PP7/m8XPR"
    "QMeLS+9u9Ozy7BwWRQF85oPFqX1+e/whGusr8s53Gqwm8Ws5vZWmjUtU081WT3grRcJwm5"
    "+jcEPOEKkqP5jtSukJTqJJSNtFcNcVnKk5YV3T5Ow8Qu1CocUmsJ/S0jXIMK16pGgm3S2C"
    "p5lD32Qixtwm3x3KSrkjCZlFxTgTKZl2DDcTJLkVDMGWpjAhn57ojaK9JR187w22yudto4"
    "lQoXzePza4NmVlWtswBJkXUJqkRwWjhHR4gAvLbIPeP/qUB4cqPsPDFjW/fgfAAlCczYrR"
    "ZQmUkwyklNbf4sZPjNudS8KBPXNF7hXyPsjooYzmpyiuNUHKfiOBXHqTjOlUsyBXurBnur"
    "jD2eEVSZTVlQl39rCqZQr0/b9kX5XNSGslCbJrprrI4iU9QjCXUW58gKyJDgxaZAi9FdWD"
    "MltngqFExZKRZiXtI7x4pI1PsuNiBmNnFF0+H7vO+Z7TCIZn2HfI65g7CFmDPEFv1DGHtZ"
    "60FONLfga3yU6mKmbAtlWyjbQilHqovZZvykqovZyllJqovRW+9i1Kr8Wwm3c46qWRXDHF"
    "FVZzOBShZN6WKb16npWoviQosxZ7ks39XI4Zvmyt1qzJZqYpW8vLO24csjkOxQ3lEcRJSm"
    "Rq3J6njMLPcLmLMvpuwwMgEmmkmtl7qACTC55DN2GBcVFbGWFKbct6mMwUu9dRXIPC3z8i"
    "9m9sRZ9gfMtwwUCKLdG2JBmZr3p7pObP7gkEldLycwQEL20Xq0bn3+kUK7k6N3vUdrH8Wk"
    "IfAYhiOH/O5DIRik+45DLE9oowfittB//Vd4kuDvA5jj7x96XMYir4hxSx2RHx4/vYvm5W"
    "TQrsH4dBbjczOPr0KkcwDfBcJHvUCMWSSMfEa7FrP2HTJhL8TYQ/AHDm/kXXSLNnHQ7gzz"
    "PSSuJpzxuIeCLzgacyPGRcFMaDecES6IusglngqXUJSmojQVpakozVoozTUnM22a1GwkOg"
    "JsSA2+jjI4JoS6WHalgTqakhCuhN7bS0tsTw3BNmXOtGk/rpTwofjoFRTTeGX9wPpYEscC"
    "8e1LJ5sBIb+vpETVxrLZjSUypZd7IfKlt+99mBMSsq9DUlK9DZt9G5S/ctU3oRttf9qDnf"
    "L1NujrzV2YNUCZCAvuLo7pd65NvSnznIJl7p2k77CKdyftwFzs3LklvqjeErkuQDTrxskd"
    "leOw+fvHHgLrnytOLrgxmDgPNv+Krh4uL0OPh2+ZdMxnMQKHyEkPYdNkr1BJWjinDMb/z0"
    "qKv46IBU6RvcAdM8aePuLXFnhWXKRjK/QPKaeJcpoop4lymiinSR1OE0X4K8J/8+hF1dhk"
    "UUzLdRHN+htUKPdJ63fmSrxOVHZxiQeZElVPcrNPMrKYso+xsOhZXGSpemcbqKhYc2vAPK"
    "NR5utQJN/JApWN5GC1zEHbpj1Ggj2G11QTtf8l3u+k0Fa2/hQVOjkOy66/IvntW4FzJJas"
    "kxqTVWVSlTtv004A5c5T7ryWu6GUO68d7ryEGqaRCbFWbcGV4517cMkFzNwtqNeTypaDUj"
    "WXZxxUSdenlnzWi52g/blXE/kuvyMkpKF+reNRndqYT5WT3SYhp1ySyiWpXJLKJalckqu3"
    "9lqWEaiXDOhqvsCSREC9HECrwGvTG1CJA/g3oxZ/GvOyDJIvQpH8FlJjoC5K8opzEcUACD"
    "TqNFe7Wi9lL2W4xlZJK0NQYwVYyuyxZJ2WKnZYqlZMxZ4jcylEuRGBXuclgbm5hLAx5oeH"
    "bAItOvlCQqImCHYKuy2vNl9uieE0FRFpEarEsLLjNq3cvBl1X9lxb/TBZqvxvd3WuP2r3/"
    "r30Ac34CSNvGa56c9WlSCPmpvjhle3pDGdL719FkR72oi02YJQ/tdGrC/lMVzSY5h+g2vA"
    "b9n+NO2BTq5DTcGSjJFKNZQczjFEO1iFeM0WvUComlUfgSln2c+fbIUEUz4UDago+YmemZ"
    "MwxudT5uScSgjmGuwZelMkJimLXVnsymJXFruy2GUt9qXdTXX6mTqluWdSaSUrUc1FtgWx"
    "EltnnHBF1GXsdLUQfVp3z7xji+0eJ9T9VoSye/p4GrvYe7Z5X92f/x/KzI/r"
)
