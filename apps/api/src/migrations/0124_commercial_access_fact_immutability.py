from tortoise import migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0123_dunning_policy_ordering_evidence")]

    initial = False

    operations = [
        ops.RunSQL(
            """
            CREATE FUNCTION commerce_reject_commercial_access_fact_update()
            RETURNS TRIGGER AS $$
            BEGIN
                RAISE EXCEPTION 'commercial access fact evidence is immutable';
            END;
            $$ LANGUAGE plpgsql;

            CREATE TRIGGER commerce_commercial_access_facts_immutable
            BEFORE UPDATE ON commerce_commercial_access_facts
            FOR EACH ROW EXECUTE FUNCTION commerce_reject_commercial_access_fact_update();
            """,
            reverse_sql="""
            DROP TRIGGER IF EXISTS commerce_commercial_access_facts_immutable
                ON commerce_commercial_access_facts;
            DROP FUNCTION IF EXISTS commerce_reject_commercial_access_fact_update();
            """,
        ),
    ]
