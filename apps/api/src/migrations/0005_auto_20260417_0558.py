from tortoise import fields
from tortoise import migrations
from tortoise.migrations import operations as ops

from src.models.workspaces.workspace import WorkspaceIconMode, WorkspaceKind


class SkipMissingConstraintRemoveConstraint(ops.RemoveConstraint):
    async def database_forward(
        self,
        app_label,
        old_state,
        new_state,
        state_editor=None,
    ) -> None:
        if not state_editor:
            return
        model = old_state.apps.get_model(f"{app_label}.{self.model_name}")
        model_state = old_state.models[(app_label, self.model_name)]
        constraint = self._resolve_constraint(model_state)
        rows = await state_editor.client.execute_query_dict(
            """
            SELECT 1
            FROM pg_constraint
            WHERE conrelid = $1::regclass
              AND conname = $2
            LIMIT 1
            """,
            [model._meta.db_table, constraint.name],
        )
        if not rows:
            return
        await super().database_forward(app_label, old_state, new_state, state_editor)


class SkipExistingColumnAddField(ops.AddField):
    async def database_forward(
        self,
        app_label,
        old_state,
        new_state,
        state_editor=None,
    ) -> None:
        if not state_editor:
            return
        model = new_state.apps.get_model(f"{app_label}.{self.model_name}")
        rows = await state_editor.client.execute_query_dict(
            """
            SELECT 1
            FROM information_schema.columns
            WHERE table_name = $1
              AND column_name = $2
            LIMIT 1
            """,
            [model._meta.db_table, self.name],
        )
        if rows:
            return
        await super().database_forward(app_label, old_state, new_state, state_editor)

class Migration(migrations.Migration):
    dependencies = [('models', '0004_workspace_icon_metadata')]

    initial = False

    operations = [
        SkipMissingConstraintRemoveConstraint(
            model_name='Workspace',
            name=None,
            fields=['kind', 'owner_user_id'],
        ),
        ops.AlterField(
            model_name='Workspace',
            name='kind',
            field=fields.CharEnumField(default=WorkspaceKind.TEAM, db_index=True, description='TEAM: team', enum_type=WorkspaceKind, max_length=4),
        ),
        SkipExistingColumnAddField(
            model_name='Workspace',
            name='icon_color',
            field=fields.CharField(default='#337ea9', max_length=16),
        ),
        SkipExistingColumnAddField(
            model_name='Workspace',
            name='icon_emoji',
            field=fields.CharField(null=True, max_length=32),
        ),
        SkipExistingColumnAddField(
            model_name='Workspace',
            name='icon_glyph',
            field=fields.CharField(null=True, max_length=64),
        ),
        SkipExistingColumnAddField(
            model_name='Workspace',
            name='icon_mode',
            field=fields.CharEnumField(default=WorkspaceIconMode.INITIALS, description='INITIALS: initials\nGLYPH: glyph\nEMOJI: emoji\nIMAGE: image', enum_type=WorkspaceIconMode, max_length=8),
        ),
    ]
