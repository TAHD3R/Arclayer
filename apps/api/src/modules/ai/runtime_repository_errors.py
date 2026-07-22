from __future__ import annotations


class AgentRuntimePersistenceError(RuntimeError):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code
