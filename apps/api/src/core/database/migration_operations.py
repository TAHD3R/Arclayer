from __future__ import annotations

from collections.abc import Iterable

from tortoise.migrations.operations import Operation, TortoiseOperation
from tortoise.migrations.schema_generator.state import State
from tortoise.migrations.schema_generator.state_apps import StateApps


class ReplaceAppState(TortoiseOperation):
    """Atomically replace one app's projected state without touching the database."""

    def __init__(self, operations: Iterable[Operation]) -> None:
        self.operations = tuple(operations)
        if not self.operations:
            raise ValueError("ReplaceAppState requires at least one state operation")

    def describe(self) -> str:
        return f"Replace projected app state ({len(self.operations)} models)"

    def state_forward(self, app_label: str, state: State) -> None:
        remaining_models = {key: model for key, model in state.models.items() if key[0] != app_label}
        state.models = remaining_models
        state.apps = StateApps()
        for (remaining_app, _), model_state in remaining_models.items():
            state.apps.register_model(remaining_app, model_state.render(state.apps))
        if remaining_models:
            state.apps._init_relations()
            state.apps._build_initial_querysets()
        for operation in self.operations:
            operation.state_forward(app_label, state)
