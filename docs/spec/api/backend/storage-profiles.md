# Storage Profiles, Route Revisions, and Provider Effects

**Status:** Approved Wave 0 core and asset-thumbnail v1 adoption contract.
**Related contract:** [Durable Background Jobs](./background-jobs.md).

This code-spec defines durable storage-provider identity, immutable non-secret
route revisions, profile lifecycle rules, and the normalized Provider Effect
ledger used by fenced Background Job Attempts. It is the canonical contract for
new provider mutations that must remain recoverable after credential rotation,
route changes, profile tombstoning, worker loss, or public/tenant commit
ambiguity.

## 1. Scope and Current Adoption Boundary

This contract applies to:

- `apps/api/src/models/storage/storage_profile.py`;
- `apps/api/src/platform/storage/profile_route_*.py` and
  `profile_routes.py`;
- `apps/api/src/modules/system/storage_profiles/**`;
- `apps/api/src/models/jobs/provider_effect.py`;
- `apps/api/src/modules/jobs/provider_effect_*.py`;
- domain handlers that create, reconcile, commit, or clean external provider
  effects.

The Wave 0 core provides the normalized identity, revision, contract,
registration, settlement, and resolution seams. Asset-thumbnail v1 now adopts
those seams end to end:

- production composition registers the exact thumbnail v1 Provider Effect
  contract and injects one normalized service into its coordinator and exact
  storage resolver;
- the pipeline registers ACTIVE evidence before its first provider write;
- the handler lists ACTIVE, COMMITTED, and CLEANED evidence marker-first,
  settles matching outputs COMMITTED, and settles exact cleanup CLEANED;
- cleanup resolves the Effect's historical Profile and Route Revision with the
  current credentials for that same provider identity;
- `JobAttemptRecord.provider_references` remains only as an inert ORM/database
  retention column with no runtime reader or writer and no dual-read/dual-write
  path.

This adoption does **not** mean every storage caller or production recovery
gate is complete:

- foreground Asset/Upload writes may still resolve profiles through the
  compatibility `get_storage_profile_by_key()` function;
- no maintenance workload yet reconciles ACTIVE effects after retry exhaustion
  or dead-lettering;
- no physical profile purge or route-revision garbage collection exists.

No new provider-effect domain may use `provider_references` as its canonical
ownership ledger. It must inject an exact versioned Provider Effect contract
and use the normalized service before its first provider mutation.

## 2. Persistence Contracts

### 2.1 `StorageProfile`

`storage_profiles` owns one stable provider identity. The relevant fields are:

- unique `(scope_type, scope_id, profile_key)`;
- immutable logical `profile_key`;
- stable provider family identity;
- `config_source = database | environment`;
- non-secret configuration and a server-side credential locator;
- operational `is_active` and legacy/default projection fields;
- nullable `tombstoned_at` with an explicit database index.

`config_source` is non-null and has both an application default and a
PostgreSQL server default of `database`. The server default is required so an
upgrade over existing rows backfills them atomically. `is_default` is a display
projection, not default-selection authority; canonical default selection is
the effective Core Settings `storage.default_profile_key`.

A profile ID and key are never reused. Tombstoning preserves the row, its
configuration, its credential locator, and all revision/effect foreign-key
targets.

### 2.2 `StorageProfileRouteRevision`

`storage_profile_route_revisions` is append-only and contains:

- `profile_id` with `ON DELETE RESTRICT`;
- monotonic `revision_number` per profile;
- canonical non-secret route JSON;
- the SHA-256 hash of canonical sorted JSON;
- unique `(profile_id, revision_number)`;
- unique `(profile_id, route_hash)`.

An identical route reuses the same revision. A different canonical route
appends a revision. Existing revisions are never updated to follow current
profile configuration. This append-only rule is enforced by the canonical
repository/service write surface; the current database schema does not install
an UPDATE-denial trigger. Direct operational rewrites are therefore outside the
application contract and are treated as persisted corruption when canonical
JSON or hash evidence drifts.

### 2.3 `ProviderEffectRecord`

`provider_effect_records` is the normalized ownership and settlement ledger.
Each row contains:

- the owning Job and owning Attempt, both `ON DELETE RESTRICT`;
- the exact Storage Profile and Route Revision, both `ON DELETE RESTRICT`;
- stable `effect_type`, positive `schema_version`, and short `effect_key`;
- a strict canonical manifest plus its SHA-256 hash;
- `active | committed | cleaned` disposition;
- registration time from the PostgreSQL clock;
- terminal settlement time, settling Attempt, and strict settlement reference.

The settling Attempt foreign key is nullable but also uses
`ON DELETE RESTRICT`. Required database shape:

- unique `(owner_attempt_id, effect_type, effect_key)`;
- index `(job_id, disposition, registered_at)`;
- index `(profile_id, disposition, registered_at)`.

`effect_key` is a bounded logical idempotency identity, not a full object key.
Complete object keys belong in the strict manifest. This keeps the composite
PostgreSQL B-tree entry within its size limit even under worst-case UTF-8.

ACTIVE rows carry no settlement evidence. COMMITTED and CLEANED rows carry all
three terminal fields. Persisted hash, disposition, manifest, and terminal
evidence drift always fails closed.

Every registration replay, list, settlement, and resolution also reloads
identity evidence through the same database connection without adding row-lock
inversions. It requires the owner Attempt and optional settling Attempt to
belong to `effect.job_id`, the Route Revision to belong to
`effect.profile_id`, and the revision JSON/hash to remain canonical. Independent
foreign keys alone do not prove those cross-row relationships.

Effect route resolution preserves the global `StorageProfile ->
ProviderEffectRecord` lock order. It treats the first Effect read only as an
untrusted routing hint, locks that Profile and resolves the hinted revision,
then locks the Effect in the same transaction. Before returning, it requires
the complete immutable registration identity to equal the hint and revalidates
the contract and all cross-row evidence through that same connection. An
identity change while the resolver waits for the Profile lock fails closed; the
resolver never holds an Effect lock while waiting for a Profile lock.

## 3. Canonical Non-Secret Route Schema

Route schema version `1` contains only:

- provider kind;
- object-storage endpoint, region, bucket, optional public bucket, and
  `forcePathStyle`; or
- one absolute local root directory.

It excludes access keys, secret values, secret references, public delivery
base URLs/modes, presign TTLs, connect/read timeouts, and local scratch paths.

Provider variants are strict:

- local routes require an absolute local root and reject every object-storage
  locator and path-style mode;
- object routes require a bucket and reject a local root;
- non-AWS object routes require an endpoint;
- schema version and booleans reject coercion (`1.0`, `true` for an integer,
  `"false"`, and similar values are invalid);
- region and bucket values reject internal whitespace and control characters.

Endpoint canonicalization accepts only HTTP/HTTPS origins. It trims surrounding
whitespace, then rejects userinfo, query or fragment delimiters, non-root
paths, any remaining whitespace, control characters, backslashes,
trailing-dot hosts, zone identifiers, invalid DNS labels, and ambiguous
numeric host forms. It normalizes scheme/host case, IDNA, IPv6, and default
ports.

Every persisted revision is revalidated when read. The service requires:

1. strict Pydantic validation succeeds;
2. raw persisted JSON equals the canonical JSON representation;
3. the recomputed hash equals `route_hash`.

Failure of any check is an invariant error. The resolver never silently
normalizes corrupt persisted evidence.

## 4. The Environment-Managed `env-default` Identity

`env-default` is a reserved logical key and a real database identity. It is not
represented by a synthetic all-zero UUID.

The key and source form one bidirectional invariant:
`profile_key == "env-default"` if and only if
`config_source == environment`. Route materialization/resolution, Product Application
list/test/update/delete, and the compatibility profile resolver all validate
that invariant before returning configuration or performing provider/admin
side effects. A legacy database-managed collision or an environment-managed
alias under another key fails closed and is never overwritten or tombstoned.

On first route materialization:

1. the service queries the system-scope key in one transaction and locks any
   existing row;
2. if absent, it performs same-connection
   `bulk_create(ignore_conflicts=True)`;
3. it reloads the canonical winning row under lock;
4. it marks that row `config_source=environment`;
5. it stores only non-secret configuration and an empty `secret_ref`;
6. it creates/reuses the canonical route revision.

Concurrent first use converges on one Profile and one revision. A pre-existing
database-managed row using the reserved key is an invariant conflict; it is not
overwritten.

At execution, the recorded revision supplies the immutable route while current
Settings supply credentials. This allows credential rotation without
redirecting an old effect. A deployment change to another provider family is
not a credential rotation: provider identity mismatch fails closed and
requires an explicit hard-cut migration.

After the persisted Profile, historical route, and current credential provider
families match, resolution overlays the historical locator onto that exact
validated credential snapshot. It does not rebuild or reread credentials after
provider-family validation.

Product Application creation of `env-default` returns `STORAGE_PROFILE_KEY_RESERVED`.
Product Application PATCH or DELETE of the environment-managed row returns
`STORAGE_PROFILE_ENVIRONMENT_MANAGED`.

## 5. Product Application and Core Settings Lifecycle

### 5.1 List, create, test, and output

- List materializes `env-default`, hides tombstoned rows, and derives the
  default badge from effective Core Settings.
- Create rejects duplicate or reserved keys, persists a database-managed
  profile, validates/materializes its route, and then returns the canonical
  representation.
- Test excludes tombstones and reports the real provider result; it does not
  fabricate connectivity success.
- `StorageProfileOut.configSource` distinguishes `database` from
  `environment` in OpenAPI and the Product Application UI.
- Secret values are never serialized. Output exposes only whether a supported
  secret is configured.

### 5.2 Partial update and route append

PATCH uses field presence, not model defaults, to build its merge. A
display-name-only or secret-only update must not reset endpoint, bucket,
path-style mode, delivery mode, or presign TTL.

The transaction locks the Profile before reading active-effect state or
materializing a revision. A provider-family change, or clearing a locator that
an existing route contains, is destructive and is rejected with
`STORAGE_PROFILE_IN_USE` while any ACTIVE normalized Effect references the
Profile. A non-destructive route change may proceed: it appends a revision and
old Effects retain their exact prior revision.

Invalid new route input maps to `STORAGE_PROFILE_CONFIG_INVALID`. Persisted
revision/hash corruption remains an internal invariant failure rather than a
user-correctable validation response.

### 5.3 Canonical default selection

An explicit Core Settings PATCH for `storage.default_profile_key`:

- normalizes a non-empty key with trim/lowercase;
- treats null or blank as an explicit reset and falls back to the deployment
  default;
- materializes `env-default` when it is selected;
- uses the lock order `StorageProfile -> SettingRecord`;
- under the Profile lock, requires system scope, existence, no tombstone,
  active state, and a valid materialized route;
- only then locks, merges, audits, and persists the Setting.

This PATCH is the only default-selection mutation surface. Storage Profile
create/update requests do not expose `is_default`; the strict request schemas
reject that legacy field. Profile list/detail responses may expose
`is_default`, but compute it from the effective Core Settings key as a display
projection. Profile deletion never rewrites Core Settings implicitly: a
currently effective default remains referenced and cannot be tombstoned until
the caller explicitly selects or resets the default through Core Settings.

Missing, inactive, tombstoned, or user-invalid routes return
`STORAGE_PROFILE_DEFAULT_UNAVAILABLE`. Persisted route corruption fails closed.
An inactive profile cannot be made default; direct profile mutation returns
`STORAGE_PROFILE_DEFAULT_INACTIVE`. Successful default mutations invalidate
the effective settings cache after commit.

### 5.4 Explicit tombstone

DELETE is an idempotent tombstone, not a physical delete. The winning
transaction:

- locks the Profile;
- rejects environment-managed identity;
- rejects current Core Settings default, Asset, or UploadSession references;
- sets `tombstoned_at` from the PostgreSQL clock;
- sets `is_active=false` and clears the default projection;
- retains route configuration, credential locator, and all revisions.

An ACTIVE normalized Effect alone does not block tombstoning. If registration
committed first, the Effect owns an exact revision and cleanup must remain able
to resolve it. If tombstoning locked the Profile first, a new registration
cannot commit. A repeated DELETE returns the existing tombstone without
rewriting its original timestamp.

No API physically purges a Profile, credential locator, Route Revision, or
Provider Effect row. A future purge/GC command must prove that no retained
effect or resource needs the evidence and must respect every RESTRICT foreign
key; it may not weaken those constraints.

## 6. Versioned Provider Effect Contracts

Jobs core owns a fail-closed registry keyed by exact
`(effect_type, schema_version)`. The default registry is empty. Domain
composition must inject each supported contract explicitly; jobs core must not
import thumbnail, publish, billing, or Connector schemas.

Each `PydanticProviderEffectContract` defines:

- one strict manifest model;
- one COMMITTED settlement model;
- one CLEANED settlement model;
- `extra="forbid"` on every model.

Registration, exact replay, list, resolution, settlement, and terminal replay
all revalidate persisted data through the exact contract. Unknown type/version,
cross-contract evidence, non-canonical replay, and the wrong settlement schema
fail before mutation.

The recursive sensitive-key and finite-number scan is only a minimum
defense-in-depth boundary. It is not a complete manifest schema, cannot prove
domain identity or key ownership, and never substitutes for an injected
versioned Pydantic contract.

### 6.1 Asset-thumbnail v1 contract

Production composition registers exactly:

```text
effect_type:    asset.thumbnail.objects
schema_version: 1
effect_key:     generated-objects
```

The manifest, COMMITTED reference, and CLEANED reference are strict, frozen,
and `extra="forbid"`. The manifest binds Job, Project, Asset, request
fingerprint, source revision, thumbnail profile version `1`, exact target
bucket, and one to four ascending unique outputs. Every output has a positive
unique width and an exact Job-owned v1 `.jpg` or `.png` object key. Source
revision is either lowercase SHA-256 or the exact `asset-id:{asset_id}`
identity. Cross-contract, cross-Job, cross-Asset, non-canonical, or hash-drifted
evidence fails closed.

`outputIdentity` is a lowercase SHA-256 over effect type/schema, exact Profile
ID, exact Route Revision ID, target bucket, and the logical manifest. It does
not contain the Effect row ID, owning or settling Attempt, mutable Profile key,
credential or secret material, or timestamps. The required terminal schemas
are deterministic and independent:

```text
COMMITTED: {kind="committed", effect_id, manifest_hash, output_identity}
CLEANED:   {kind="cleaned",   effect_id, manifest_hash, output_identity}
```

Attempt/run identifiers, cleanup reasons, and completion timestamps are
forbidden terminal-reference fields. Every read and replay re-derives the
identity and requires all three reference identities to match the Effect row.

## 7. Fenced Registration Protocol

The caller first materializes a `StorageProfileRouteBinding`, but performs no
provider mutation yet. `register_effect()` then uses one public-database
transaction and this lock order:

```text
Job -> Attempt -> StorageProfile -> ProviderEffect
```

The transaction:

1. validates the contract and canonical manifest hash;
2. locks Job and Attempt;
3. reads the PostgreSQL clock and validates lease, generation, fencing token,
   and cancellation;
4. locks the Profile;
5. locks the exact Effect identity if it exists;
6. reads a fresh PostgreSQL clock and repeats fence/cancellation validation;
7. validates the exact revision, hash, and pre-resolved route binding;
8. for a new row, requires active/non-tombstoned Profile and requires the
   binding still equal the Profile's current materialized route;
9. inserts ACTIVE evidence or validates byte-equivalent canonical replay;
10. renews the Attempt and commits.

Only after this transaction commits may the caller cross the provider write
boundary. The second clock check is mandatory: an Attempt may expire while
waiting for the Profile lock.

Exact replay returns the same row even if the Profile was later inactive or
tombstoned. It also returns an already COMMITTED/CLEANED row and never
reactivates it. A different profile, revision, schema, manifest, or hash is an
invariant conflict.

New-registration authorization conflicts have a dedicated exception hierarchy
that callers inspect by type and fields, never by message text:

- `ProviderEffectRegistrationError(RuntimeError)` carries a read-only,
  non-sensitive `profile_id`;
- `ProviderEffectRegistrationProfileUnavailableError` is used only when a new
  Effect targets a missing, inactive, or tombstoned Profile;
- `ProviderEffectRegistrationRouteStaleError` is used only when the submitted
  pre-resolved binding no longer equals the locked current route. It also
  carries read-only `expected_route_hash` and `observed_route_hash` fields.

These exceptions deliberately do not inherit `JobExecutionStateInvariantError`.
Contract corruption, missing persisted relations, a missing/cross-row Route
Revision, hash or canonical JSON drift, and conflicting replay identity remain
generic invariant failures. In particular, a caller that reuses an existing
Effect identity with another missing Profile has a replay conflict; it must not
be misdiagnosed as the existing Effect's Profile having disappeared. Typed
unavailability applies to new registration only and never invalidates exact
replay of retained evidence.

## 8. Fenced Listing, Settlement, and Resolution

`list_effects()` locks `Job -> Attempt -> ProviderEffect` and returns every
Effect owned by the Job across ACTIVE, COMMITTED, and CLEANED dispositions in
stable `(registered_at, id)` order. `list_active_effects()` remains the
ACTIVE-only compatibility seam for maintenance paths that need only unresolved
effects. Both methods use the same fenced protocol: validate the locked
Job/Attempt lease, lock the selected Effect rows, read a fresh PostgreSQL clock
and revalidate the fence, validate every persisted versioned contract and
cross-row relation, renew the Attempt, and return immutable snapshots. An
Attempt that expires while waiting for an Effect lock fails before validation,
renewal, or return.

A cancellation request is control information for listing and settlement, not
lease loss. Both listing methods surface it through
`JobExecutionControlSnapshot.cancellation_requested`, continue fail-closed
validation, and renew the valid Attempt so reconciliation and cleanup can
proceed. Settlement likewise remains available after a cancellation request.
Only `register_effect()` rejects cancellation before authorizing a new provider
mutation.

Settlement locks `Job -> Attempt -> ProviderEffect` with Effect IDs in stable
order. It requires the exact requested Job-owned row set and a current fence.
`ACTIVE -> COMMITTED|CLEANED` is a SQL compare-and-set that also requires all
terminal evidence columns to be null. It cannot repair a corrupt ACTIVE row.

Exact terminal replay is idempotent when disposition and canonical settlement
reference match. A later reconciliation Attempt may replay the same settlement
without replacing the original `settled_by_attempt_id`. COMMITTED and CLEANED
cannot be swapped.

Job terminal state and Effect settlement are orthogonal. A FAILED or
DEAD_LETTERED Job may still own ACTIVE effects; durable reconciliation is
required rather than inventing settlement from Job state.

Effect route resolution follows the stored Profile and exact Revision foreign
keys. It permits an inactive or tombstoned Profile, combines the recorded route
with the current credential source, and fails closed on missing/corrupt
evidence.

`resolve_storage_profile_binding(binding)` is the public resolver for callers
that already hold a complete `StorageProfileRouteBinding`. In one transaction
it locks the exact Profile, resolves only the supplied Profile ID and Revision
ID, and compares the returned complete binding -- Profile ID, Revision ID,
route hash, and embedded route -- with the input before returning. It never
falls back to a key, latest revision, current/default Profile, or
`env-default`. Missing relations, persisted revision corruption, and any full
binding mismatch fail as invariants. Historical resolution intentionally
permits inactive/tombstoned Profiles and uses current credentials; active and
current-route authorization for a new mutation remains exclusively in
materialization plus fenced registration.

Thumbnail keeps three capabilities separate. Existing-source read may resolve
the source's recorded Profile or the effective default only to read that
existing object; it never authorizes an output. New-output authorization calls
`materialize_storage_profile_route()` and then
`resolve_storage_profile_binding()` for the same complete active binding before
registration. Cleanup calls only `resolve_effect_route(effect_id)`, accepts the
retained inactive/tombstoned Profile, replays the exact historical route and
recorded route/public bucket, and uses current credentials. Cleanup never
re-resolves a Profile key, latest revision, effective default, or another
bucket.

## 9. Linearization and Crash Windows

| Boundary | Required result |
|---|---|
| Route/profile update wins the Profile lock before registration | Stale pre-resolved registration fails before provider mutation. |
| Tombstone wins the Profile lock before registration | New registration fails; no Effect row is inserted. |
| Registration commits before tombstone | Tombstone may proceed; exact Effect/Revision/credential locator remain resolvable. |
| Worker crashes after registration but before provider write | ACTIVE evidence remains; cleanup may replay object-not-found as idempotent success. |
| Provider write succeeds or is ambiguous, then worker crashes | ACTIVE manifest already contains the exact allowed provider identities; reconciliation never guesses a prefix. |
| Lease expires while registration waits on Profile | The second PostgreSQL clock/fence check rejects the stale Attempt. |
| Lease expires while listing waits on Effect | The second PostgreSQL clock/fence check rejects the stale Attempt and the transaction does not renew or return snapshots. |
| Cancellation is requested before listing or settlement | Reconciliation remains fenced and available; it surfaces cancellation, validates evidence, and renews the valid Attempt. |
| Domain marker commits but public COMMITTED settlement fails | Domain composition must read marker first and replay exact settlement without repeating the provider effect. |
| Cleanup completes but CLEANED settlement fails | Reconciliation repeats exact cleanup; object-not-found converges, then settlement replays. |
| Persisted manifest/revision/settlement drifts | Read, replay, list, settlement, and resolution fail closed. |

The tenant marker and public Effect row are not one cross-schema transaction.
The core supplies durable evidence and fencing, while each adopting domain must
implement marker-first reconciliation and exact cleanup. Thumbnail v1 has
completed that runtime hard cut: marker replay settles exact live evidence
COMMITTED without cleanup, while marker absence first preflights every ACTIVE
historical route, deletes exact keys, and settles CLEANED. A COMMITTED Effect
without its canonical marker fails closed. The maintenance owner is also
implemented: a bounded `SKIP LOCKED` control scan fans out idempotent durable
recovery Jobs, and each Job uses its own fenced Attempt to re-resolve current
credentials against the Effect's exact historical Profile/Route Revision.
Scanner concurrency, seeded terminal-orphan Taskiq cleanup, and real
cross-Job settlement are covered. The separate OS worker-kill acceptance is
also covered for local storage: two production worker generations are killed
after their own ACTIVE registration and real object writes, then lease recovery,
retry exhaustion/dead-lettering, bounded maintenance fan-out, exact cleanup,
and CLEANED settlement converge without seeded Effects.

## 10. Compatibility and Deployment Boundaries

The signature and general read semantics of
`get_storage_profile_by_key(*, settings, profile_key)` remain unchanged because
it has a broad existing call graph. Existing-resource reads may need a
tombstoned Profile to interpret old objects.

That compatibility function is not an authorization seam for new provider
writes. Provider Effects use the active-only materialization/registration
protocol. Foreground Asset/Upload new writes that still use the compatibility
resolver remain a known hard-cut risk: they need a purpose-specific active-only
resolver before profile tombstones can be considered complete across every
storage write path.

`JobAttemptRecord.provider_references` remains physically mapped only as inert
retention evidence. Jobs core and thumbnail production runtime expose no
reader, writer, backfill, or conversion path for it. The normalized thumbnail
migration therefore requires an atomic worker-fleet cutover: quiesce and drain
all old thumbnail workers before starting the new fleet. Old and new workers
must not run together, and no dual-read/dual-write compatibility bridge is
supported.

The following work remains explicit rather than silently emulated:

- repeat process-loss/provider ambiguity evidence against configured S3
  providers; the local-storage proof does not stand in for S3 behavior;
- hard-cut non-Effect new writes to an active-only profile resolver;
- design retention-aware physical purge/revision GC if the product ever needs
  it.

## 11. Migration and Verification Contract

Migration artifacts are generated only through the repository command. The
legacy-safe sequence is intentionally two-stage because the current Tortoise
generator emits an index before a newly added indexed field when both changes
share one migration:

1. `0015` creates Route Revision and Provider Effect tables, adds
   `config_source` with PostgreSQL default `database`, and adds nullable
   `tombstoned_at`;
2. `0016` depends on `0015` and adds the explicit Meta index for
   `tombstoned_at`.

The real PostgreSQL upgrade fixture starts at `0014`, inserts an inactive,
default-projected legacy Profile with non-empty config and secret evidence,
upgrades through `0016`, and verifies:

- legacy config, secret locator, active state, and default projection do not
  drift;
- `config_source` is non-null, has a database default, and is backfilled;
- both new tables exist;
- all five Provider Effect FKs and the Route Revision FK use RESTRICT;
- all three composite unique constraints exist;
- Provider Effect lookup indexes and the tombstone index exist;
- both generated migrations are recorded as applied.

Required focused evidence also covers strict route parsing, contract-registry
failure, manifest/settlement invariants, exact replay, CAS settlement,
registration/tombstone/update lock races on distinct PostgreSQL backends,
environment identity convergence, credential rotation, partial PATCH behavior,
and tombstone idempotency. Thumbnail-specific evidence additionally covers the
exact v1 type/key/version, canonical output keys, stable output identity that
excludes secrets, Attempts, and timestamps, registration before the first
provider `put`, all-disposition marker-first convergence, exact old-revision
cleanup after route change or tombstone, hard-deleted Asset cleanup,
deterministic terminal references, and object-not-found CLEANED replay.
The local-storage process-kill plus retry-exhaustion maintenance reconciliation
acceptance is implemented by
`test_asset_thumbnail_worker_kill_recovery_integration.py`. It uses two real
worker process groups and a real tenant row lock only to hold the marker commit
window, observes pending stream state after each `SIGKILL`, and requires the
second reap plus maintenance Job to settle exact cleanup. S3 process loss and
provider ambiguity remain separate acceptance work; local runtime adoption does
not prove them.
