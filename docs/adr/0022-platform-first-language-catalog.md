# Roll out the Language Catalog to Platform first

**Status:** accepted

The new System Settings Language Catalog will initially govern only the Platform Console. Product Application locale metadata and resource loading remain unchanged for this rollout; a follow-up migration will connect `apps/app` to the shared deployment catalog after the Platform contract, caching, and resource validation are proven.

**TODO**

- Add a later cross-application migration ADR covering Product Application bootstrap, namespace parity, workspace/project localization interactions, and rollback.

**Consequences**

- Platform and Product Application may temporarily expose different enabled-language sets.
- The System Settings UI must say “Platform languages” rather than implying instance-wide application coverage.
- No Product Application locale code or dependency is changed in this rollout unless required for shared infrastructure tests.
