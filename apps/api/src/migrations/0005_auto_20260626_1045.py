from tortoise import fields, migrations
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [('models', '0004_auto_20260626_0936')]

    initial = False

    operations = [
        ops.AddField(
            model_name='AgentRunRecord',
            name='langgraph_thread_id',
            field=fields.CharField(null=True, max_length=160, unique=True, db_index=True),
        ),
        ops.RunSQL(
            "UPDATE agent_runs SET langgraph_thread_id = CONCAT('agent-run:', id::text) "
            "WHERE langgraph_thread_id IS NULL",
            "UPDATE agent_runs SET langgraph_thread_id = NULL",
        ),
        ops.AlterField(
            model_name='AgentRunRecord',
            name='langgraph_thread_id',
            field=fields.CharField(max_length=160, unique=True, db_index=True),
        ),
        ops.AddField(
            model_name='AgentRunRecord',
            name='langgraph_checkpoint_ns',
            field=fields.CharField(default='project-agent', max_length=96, db_index=True),
        ),
        ops.AddField(
            model_name='AgentRunRecord',
            name='langgraph_checkpoint_id',
            field=fields.CharField(null=True, max_length=192, db_index=True),
        ),
        ops.AddField(
            model_name='AgentRunRecord',
            name='langgraph_checkpoint_node',
            field=fields.CharField(null=True, max_length=96, db_index=True),
        ),
    ]
