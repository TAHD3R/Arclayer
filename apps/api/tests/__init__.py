"""Test package marker.

Pytest loads `conftest.py` via normal Python import mechanics.
Keeping `tests` as an importable package avoids surprises when we share
test utilities across modules (e.g. `tests.utils.*`).
"""
